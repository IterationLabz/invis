#import <Metal/Metal.h>
#import <QuartzCore/CAMetalLayer.h>
#import <Cocoa/Cocoa.h>
#import <node_api.h>
#include <CoreGraphics/CoreGraphics.h>

@interface GPURenderer : NSObject {
    id<MTLDevice> device;
    id<MTLCommandQueue> commandQueue;
    CAMetalLayer *metalLayer;
    NSView *contentView;
}

- (instancetype)initWithView:(NSView *)view;
- (void)renderDirectToFramebuffer;
@end

@implementation GPURenderer

- (instancetype)initWithView:(NSView *)view {
    self = [super init];
    if (self) {
        contentView = view;

        if (!contentView) {
            NSLog(@"❌ Invalid content view");
            return nil;
        }

        NSWindow *window = [contentView window];
        NSLog(@"✅ Got NSView: %@", contentView);
        NSLog(@"   Window: %@", window);
        NSLog(@"   Window number: %ld", (long)[window windowNumber]);

        // Initialize Metal device
        device = MTLCreateSystemDefaultDevice();
        if (!device) {
            NSLog(@"❌ Metal not supported");
            return nil;
        }

        commandQueue = [device newCommandQueue];

        // Create Metal layer
        metalLayer = [CAMetalLayer layer];
        metalLayer.device = device;
        metalLayer.pixelFormat = MTLPixelFormatBGRA8Unorm;
        metalLayer.framebufferOnly = NO;
        metalLayer.displaySyncEnabled = NO;
        metalLayer.frame = contentView.bounds;

        // CRITICAL: Replace view's layer with Metal layer
        // This makes the content render via GPU, bypassing standard compositor path
        [contentView setLayer:metalLayer];
        [contentView setWantsLayer:YES];

        NSLog(@"✅ Metal GPU renderer initialized");
        NSLog(@"   Device: %@", device.name);
        NSLog(@"   Layer size: %@", NSStringFromSize(metalLayer.drawableSize));
    }
    return self;
}

- (void)renderDirectToFramebuffer {
    @autoreleasepool {
        id<CAMetalDrawable> drawable = [metalLayer nextDrawable];
        if (!drawable) {
            NSLog(@"❌ No drawable");
            return;
        }

        MTLRenderPassDescriptor *rpd = [MTLRenderPassDescriptor renderPassDescriptor];
        rpd.colorAttachments[0].texture = drawable.texture;
        rpd.colorAttachments[0].loadAction = MTLLoadActionClear;

        // Bright green to verify GPU rendering
        rpd.colorAttachments[0].clearColor = MTLClearColorMake(0.0, 1.0, 0.0, 1.0);
        rpd.colorAttachments[0].storeAction = MTLStoreActionStore;

        id<MTLCommandBuffer> commandBuffer = [commandQueue commandBuffer];
        id<MTLRenderCommandEncoder> encoder = [commandBuffer renderCommandEncoderWithDescriptor:rpd];
        [encoder endEncoding];

        [commandBuffer presentDrawable:drawable];
        [commandBuffer commit];

        NSLog(@"✅ GPU FRAMEBUFFER RENDERED (BYPASSED COMPOSITOR)");
    }
}

@end

static GPURenderer *globalRenderer = nil;

napi_value InitGPURenderer(napi_env env, napi_callback_info info) {
    size_t argc = 1;
    napi_value args[1];
    napi_get_cb_info(env, info, &argc, args, nullptr, nullptr);

    void *data;
    size_t length;
    napi_get_buffer_info(env, args[0], &data, &length);

    NSLog(@"📍 Buffer: %zu bytes", length);

    if (length < 8) {
        NSLog(@"❌ Invalid buffer");
        napi_value result;
        napi_get_boolean(env, false, &result);
        return result;
    }

    // Extract NSView pointer
    void *viewPtr = *((void **)data);
    NSView *view = (__bridge NSView *)viewPtr;

    NSLog(@"   View pointer: %p", viewPtr);
    NSLog(@"   View class: %@", [view className]);

    globalRenderer = [[GPURenderer alloc] initWithView:view];

    NSLog(@"🎨 GPU Renderer: %@", globalRenderer ? @"✅ READY" : @"❌ FAILED");

    napi_value result;
    napi_get_boolean(env, globalRenderer != nil, &result);
    return result;
}

napi_value RenderToGPU(napi_env env, napi_callback_info info) {
    if (!globalRenderer) {
        NSLog(@"❌ Not initialized");
        napi_value result;
        napi_get_boolean(env, false, &result);
        return result;
    }

    [globalRenderer renderDirectToFramebuffer];

    napi_value result;
    napi_get_boolean(env, true, &result);
    return result;
}

napi_value Init(napi_env env, napi_value exports) {
    napi_value initFn, renderFn;

    napi_create_function(env, "initGPURenderer", NAPI_AUTO_LENGTH, InitGPURenderer, nullptr, &initFn);
    napi_create_function(env, "renderToGPU", NAPI_AUTO_LENGTH, RenderToGPU, nullptr, &renderFn);

    napi_set_named_property(env, exports, "initGPURenderer", initFn);
    napi_set_named_property(env, exports, "renderToGPU", renderFn);

    return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
