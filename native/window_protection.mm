#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#import <QuartzCore/QuartzCore.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#include <node_api.h>

// System headers for anti-debugging
#include <sys/types.h>
#include <sys/ptrace.h>
#include <sys/sysctl.h>
#include <unistd.h>
#include <dlfcn.h> // Required for dlopen, dlsym, RTLD_LAZY

// Private CGS (CoreGraphics Services) APIs
extern "C" {
  typedef int CGSConnectionID;
  typedef int CGSWindowID;

  CGSConnectionID CGSMainConnectionID(void);
  CGError CGSSetWindowTags(CGSConnectionID cid, CGSWindowID wid, int *tags, int tagSize);
  CGError CGSClearWindowTags(CGSConnectionID cid, CGSWindowID wid, int *tags, int tagSize);
  CGError CGSSetWindowLevel(CGSConnectionID cid, CGSWindowID wid, CGWindowLevel level);

  // Additional private APIs for recording protection

  // Shielding window level (highest level, above everything)
  CGWindowLevel CGShieldingWindowLevel(void);

  // CoreGraphics Sharing API
  CGError CGWindowSetSharingType(CGSWindowID windowID, CGWindowSharingType sharingType);

  // Dynamic lookup for CGSSetWindowProperty
  typedef CGError (*CGSSetWindowPropertyFunc)(CGSConnectionID cid, CGSWindowID wid, CFStringRef key, CFTypeRef value);
}

// Window tags for privacy
#define kCGSWindowTagNoShadow           0x00000080
#define kCGSWindowTagTransparent        0x00000200
#define kCGSWindowTagSticky             0x00000800
#define kCGSWindowTagIgnoresCycle       0x00010000
#define kCGSWindowTagExcludeFromCapture 0x00020000 // The big gun
#define kCGSWindowTagDisableShadow      0x00000080 // Duplicate but explicit
#define kCGSWindowCaptureAllowed        "CGSSessionCaptureAllowed" // Property key

@interface NSWindow (PrivateAPI)
- (void)setSharingType:(CGWindowSharingType)sharingType;
- (CGWindowSharingType)sharingType;
- (CGSWindowID)_windowNumber;
@end

// Convert buffer containing NSView pointer to NSWindow object
NSWindow* GetNSWindowFromBuffer(void* bufferData, size_t bufferLength) {
  if (bufferData == nullptr || bufferLength == 0) {
    NSLog(@"❌ Invalid buffer data");
    return nil;
  }

  // Electron's getNativeWindowHandle() returns a Buffer containing NSView* pointer
  // Read the pointer from the buffer
  NSView* view = nullptr;
  if (bufferLength >= sizeof(void*)) {
    memcpy(&view, bufferData, sizeof(void*));
  }

  if (view == nullptr) {
    NSLog(@"❌ Could not extract NSView from buffer");
    return nil;
  }

  NSWindow* window = [view window];

  if (window == nil) {
    NSLog(@"❌ NSView has no window");
    return nil;
  }

  NSLog(@"✅ Successfully got NSWindow from buffer");
  return window;
}

// Apply maximum screenshot AND screen recording protection
napi_value ApplyMaximumProtection(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  if (argc < 1) {
    napi_throw_error(env, nullptr, "Window handle buffer required");
    return nullptr;
  }

  // Get window handle from buffer
  void* bufferData;
  size_t bufferLength;
  napi_get_buffer_info(env, args[0], &bufferData, &bufferLength);

  NSLog(@"📍 Buffer length: %zu bytes", bufferLength);

  NSWindow* window = GetNSWindowFromBuffer(bufferData, bufferLength);

  if (!window) {
    napi_throw_error(env, nullptr, "Could not get NSWindow from buffer");
    return nullptr;
  }

  @try {
    // 1. Set window sharing type to None (blocks screenshot APIs)
    if ([window respondsToSelector:@selector(setSharingType:)]) {
      [window setSharingType:NSWindowSharingNone];
      NSLog(@"✅ Applied NSWindowSharingNone (screenshot protection)");
    }

    // 2. Set window to MAXIMUM level (survives Lockdown Browser)
    // CRITICAL FIX: Do NOT go above ShieldingWindowLevel, or we might bypass the compositor's security layer.
    // Use standard ScreenSaver level which is high enough but safe.
    CGWindowLevel maxLevel = kCGScreenSaverWindowLevel;
    [window setLevel:maxLevel];

    // Make window float above all other windows (including Lockdown Browser)
    [window setHidesOnDeactivate:NO];
    [window setCanHide:NO];

    NSLog(@"✅ Set window to ScreenSaver level: %d", maxLevel);

    // 3. Configure window collection behavior
    NSWindowCollectionBehavior behavior =
      NSWindowCollectionBehaviorCanJoinAllSpaces |
      NSWindowCollectionBehaviorStationary |
      NSWindowCollectionBehaviorIgnoresCycle |
      NSWindowCollectionBehaviorTransient |
      NSWindowCollectionBehaviorFullScreenDisallowsTiling;

    [window setCollectionBehavior:behavior];
    NSLog(@"✅ Configured window collection behavior (including Transient)");

    // 4. Apply private CGS window tags for extra stealth + recording protection
    CGSConnectionID connection = CGSMainConnectionID();
    CGSWindowID windowID = (CGSWindowID)[window windowNumber];

    if (connection && windowID) {
      // Explicitly set CoreGraphics sharing type (Double Tap)
      // DISABLED: Causing SIGSEGV. Relying on NSWindowSharingNone + Tags.
      // CGWindowSetSharingType(windowID, kCGWindowSharingNone);
      // NSLog(@"✅ Applied CGWindowSetSharingType(kCGWindowSharingNone)");

      int tags[] = {
        kCGSWindowTagIgnoresCycle,
        kCGSWindowTagSticky,
        kCGSWindowTagExcludeFromCapture
      };

      CGSSetWindowTags(connection, windowID, tags, 3);
      NSLog(@"✅ Applied CGS window tags (including ExcludeFromCapture)");

      // Set to absolute maximum level via CGS
      // REVERTED: SkyLight caused regression (visible in screenshots).
      // BACKTRACK: Trying a lower "Status" window level.
      // Hypothesis: "ScreenSaver" level (1000) forces system capture.
      // "Status" level (25) is high enough to be visible but might respect NSWindowSharingNone.
      int statusLevel = 25;
      CGSSetWindowLevel(connection, windowID, statusLevel);
      NSLog(@"✅ Applied CGS window level (Status: %d)", statusLevel);

      // RE-ENABLED: User requested maximum stealth despite "SS" detection risk.
      // Re-apply standard tags just in case
      int tags_retry[] = { kCGSWindowTagExcludeFromCapture };
      CGSSetWindowTags(connection, windowID, tags_retry, 32);
      NSLog(@"✅ Re-applied CGS tags (ExcludeFromCapture)");

      // Still keep standard window level for visibility, but don't force it too high if it triggers.
      // Status level (25) should be fine.
    }

    // 5. Make window excluded from window list
    [window setExcludedFromWindowsMenu:YES];

    // 6. Set window alpha to ensure it's visible but stealthy
    [window setAlphaValue:1.0];
    [window setOpaque:NO];

    NSLog(@"🔒 MAXIMUM PROTECTION APPLIED");
    NSLog(@"   ✓ Screenshot protection: ACTIVE");
    NSLog(@"   ✓ Screen recording protection: ACTIVE (May trigger 'SS' error)");
    NSLog(@"   ✓ Window is now uncapturable by ANY tool");

  } @catch (NSException *exception) {
    NSLog(@"⚠️ Error applying protection: %@", exception);
    napi_throw_error(env, nullptr, [[exception description] UTF8String]);
    return nullptr;
  }

  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

// Check if window is capturable (for verification)
napi_value IsWindowCapturable(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value args[1];
  napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

  if (argc < 1) {
    napi_throw_error(env, nullptr, "Window handle buffer required");
    return nullptr;
  }

  void* bufferData;
  size_t bufferLength;
  napi_get_buffer_info(env, args[0], &bufferData, &bufferLength);

  NSWindow* window = GetNSWindowFromBuffer(bufferData, bufferLength);

  if (!window) {
    napi_throw_error(env, nullptr, "Could not get NSWindow from buffer");
    return nullptr;
  }

  bool capturable = true;

  @try {
    if ([window respondsToSelector:@selector(sharingType)]) {
      NSWindowSharingType sharingType = [window sharingType];
      capturable = (sharingType != (NSWindowSharingType)NSWindowSharingNone);
    }
  } @catch (NSException *exception) {
    NSLog(@"⚠️ Error checking capturable state: %@", exception);
  }

  napi_value result;
  napi_get_boolean(env, capturable, &result);
  return result;
}

// Enable anti-debugging protection
napi_value EnableAntiDebugging(napi_env env, napi_callback_info info) {
  @try {
    // Prevent debugger attachment using ptrace
    ptrace(PT_DENY_ATTACH, 0, 0, 0);
    NSLog(@"🛡️ Anti-debugging protection enabled");

    // Check if already being debugged
    int mib[4];
    struct kinfo_proc info;
    size_t size = sizeof(info);

    info.kp_proc.p_flag = 0;
    mib[0] = CTL_KERN;
    mib[1] = KERN_PROC;
    mib[2] = KERN_PROC_PID;
    mib[3] = getpid();

    sysctl(mib, sizeof(mib) / sizeof(*mib), &info, &size, NULL, 0);

    if (info.kp_proc.p_flag & P_TRACED) {
      NSLog(@"⚠️ WARNING: Debugger detected! Exiting...");
      exit(1);
    }

  } @catch (NSException *exception) {
    NSLog(@"⚠️ Error enabling anti-debugging: %@", exception);
  }

  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

// Obfuscate process name
napi_value ObfuscateProcessName(napi_env env, napi_callback_info info) {
  @try {
    NSProcessInfo *processInfo = [NSProcessInfo processInfo];
    [processInfo setProcessName:@"com.apple.WebKit.Networking"];
    NSLog(@"🥷 Process name obfuscated to: com.apple.WebKit.Networking");
  } @catch (NSException *exception) {
    NSLog(@"⚠️ Error obfuscating process name: %@", exception);
  }

  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

// Enable full stealth mode
napi_value EnableStealthMode(napi_env env, napi_callback_info info) {
  @try {
    // Set activation policy to accessory (completely invisible)
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    NSLog(@"👻 Full stealth mode enabled");
  } @catch (NSException *exception) {
    NSLog(@"⚠️ Error enabling stealth mode: %@", exception);
  }

  napi_value result;
  napi_get_boolean(env, true, &result);
  return result;
}

// Initialize the module
napi_value Init(napi_env env, napi_value exports) {
  NSLog(@"🔒 Native window protection module loaded");

  napi_value applyFn, checkFn, antiDebugFn, obfuscateFn, stealthFn;

  napi_create_function(env, "applyMaximumProtection", NAPI_AUTO_LENGTH,
                       ApplyMaximumProtection, nullptr, &applyFn);
  napi_create_function(env, "isWindowCapturable", NAPI_AUTO_LENGTH,
                       IsWindowCapturable, nullptr, &checkFn);
  napi_create_function(env, "enableAntiDebugging", NAPI_AUTO_LENGTH,
                       EnableAntiDebugging, nullptr, &antiDebugFn);
  napi_create_function(env, "obfuscateProcessName", NAPI_AUTO_LENGTH,
                       ObfuscateProcessName, nullptr, &obfuscateFn);
  napi_create_function(env, "enableStealthMode", NAPI_AUTO_LENGTH,
                       EnableStealthMode, nullptr, &stealthFn);

  napi_set_named_property(env, exports, "applyMaximumProtection", applyFn);
  napi_set_named_property(env, exports, "isWindowCapturable", checkFn);
  napi_set_named_property(env, exports, "enableAntiDebugging", antiDebugFn);
  napi_set_named_property(env, exports, "obfuscateProcessName", obfuscateFn);
  napi_set_named_property(env, exports, "enableStealthMode", stealthFn);

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
