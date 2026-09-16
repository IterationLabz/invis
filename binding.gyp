{
  "targets": [
    {
      "target_name": "window_protection",
      "sources": [ "native/window_protection.mm" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ['OS=="mac"', {
          "xcode_settings": {
            "OTHER_CFLAGS": [
              "-ObjC++",
              "-std=c++17"
            ],
            "OTHER_LDFLAGS": [
              "-framework Cocoa",
              "-framework CoreGraphics",
              "-framework QuartzCore"
            ],
            "MACOSX_DEPLOYMENT_TARGET": "10.13"
          }
        }]
      ]
    },
    {
      "target_name": "gpu_renderer",
      "sources": [ "native/gpu_renderer.mm" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ['OS=="mac"', {
          "xcode_settings": {
            "OTHER_CFLAGS": [
              "-ObjC++",
              "-std=c++17"
            ],
            "OTHER_LDFLAGS": [
              "-framework Cocoa",
              "-framework Metal",
              "-framework QuartzCore",
              "-framework CoreGraphics"
            ],
            "MACOSX_DEPLOYMENT_TARGET": "10.13"
          }
        }]
      ]
    },
    {
      "target_name": "window_privacy",
      "sources": [ "native/window_privacy.mm" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ['OS=="mac"', {
          "xcode_settings": {
            "OTHER_CFLAGS": [
              "-ObjC++",
              "-std=c++17"
            ],
            "OTHER_LDFLAGS": [
              "-framework Cocoa",
              "-framework CoreGraphics",
              "-framework ApplicationServices"
            ],
            "MACOSX_DEPLOYMENT_TARGET": "10.13"
          }
        }]
      ]
    }
  ]
}
