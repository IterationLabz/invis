const path = require('path');

class GPUFramebufferRenderer {
  constructor() {
    this.nativeModule = null;
    this.initialized = false;
  }

  initialize(window) {
    try {
      const modulePath = path.join(__dirname, 'build', 'Release', 'gpu_renderer.node');
      this.nativeModule = require(modulePath);

      // Get native window handle buffer (contains NSWindow pointer)
      const handleBuffer = window.getNativeWindowHandle();

      console.log(`   Window handle buffer: ${handleBuffer.length} bytes`);
      console.log(`   Buffer hex: ${handleBuffer.toString('hex')}`);

      // Pass buffer directly to native code
      const success = this.nativeModule.initGPURenderer(handleBuffer);

      if (success) {
        this.initialized = true;
        console.log('✅ Metal device connected');
        console.log('✅ Direct framebuffer access enabled');
        console.log('✅ Compositor bypass active');
        console.log('');
        console.log('⚠️  STEALTH MODE: Content bypasses ScreenCaptureKit');
        return true;
      } else {
        console.error('❌ Failed to initialize GPU renderer');
        return false;
      }
    } catch (error) {
      console.error('❌ GPU renderer initialization error:', error.message);
      console.error('   Stack:', error.stack);
      return false;
    }
  }

  renderDirectToGPU(content) {
    if (!this.initialized) {
      console.error('❌ GPU renderer not initialized');
      return false;
    }

    try {
      const success = this.nativeModule.renderToGPU(content);
      if (success) {
        console.log('✅ Rendered to GPU framebuffer (bypassed compositor)');
      }
      return success;
    } catch (error) {
      console.error('❌ GPU render error:', error.message);
      return false;
    }
  }

  update(newContent) {
    return this.renderDirectToGPU(newContent);
  }

  isAvailable() {
    return this.initialized;
  }
}

module.exports = new GPUFramebufferRenderer();
