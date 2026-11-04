// AUTOMATISCH ERZEUGT aus testsoftware (scripts/presentation_seite_ins_crm.py) - nicht von Hand aendern.
// Gleiche Regeln wie im Agenten (presentation_design.py).
export const PRESENTATION_FIELDS = {
  "preset": {
    "kind": "wahl",
    "default": "classic",
    "limits": [
      "classic",
      "signature",
      "midnight",
      "clean"
    ]
  },
  "orientation": {
    "kind": "wahl",
    "default": 0,
    "limits": [
      0,
      90,
      180,
      270
    ]
  },
  "layout": {
    "kind": "wahl",
    "default": "grid",
    "limits": [
      "grid",
      "carousel",
      "spotlight",
      "marquee"
    ]
  },
  "columns": {
    "kind": "zahl",
    "default": 3,
    "limits": [
      1,
      6
    ]
  },
  "rows": {
    "kind": "zahl",
    "default": 2,
    "limits": [
      1,
      6
    ]
  },
  "order": {
    "kind": "wahl",
    "default": "newest",
    "limits": [
      "newest",
      "oldest"
    ]
  },
  "page_seconds": {
    "kind": "zahl",
    "default": 10,
    "limits": [
      3,
      120
    ]
  },
  "max_photos": {
    "kind": "zahl",
    "default": 24,
    "limits": [
      1,
      60
    ]
  },
  "marquee_speed": {
    "kind": "zahl",
    "default": 60,
    "limits": [
      10,
      400
    ]
  },
  "background": {
    "kind": "farbe",
    "default": "#3977BD",
    "limits": null
  },
  "background2": {
    "kind": "farbe_leer",
    "default": "",
    "limits": null
  },
  "font": {
    "kind": "wahl",
    "default": "segoe",
    "limits": [
      "segoe",
      "bahnschrift",
      "arial",
      "georgia",
      "trebuchet"
    ]
  },
  "gap": {
    "kind": "zahl",
    "default": 20,
    "limits": [
      0,
      80
    ]
  },
  "padding": {
    "kind": "zahl",
    "default": 20,
    "limits": [
      0,
      160
    ]
  },
  "radius": {
    "kind": "zahl",
    "default": 0,
    "limits": [
      0,
      48
    ]
  },
  "border_width": {
    "kind": "zahl",
    "default": 0,
    "limits": [
      0,
      12
    ]
  },
  "border_color": {
    "kind": "farbe",
    "default": "#FFFFFF",
    "limits": null
  },
  "shadow": {
    "kind": "ja",
    "default": false,
    "limits": null
  },
  "card_background": {
    "kind": "farbe_leer",
    "default": "",
    "limits": null
  },
  "label_mode": {
    "kind": "wahl",
    "default": "below",
    "limits": [
      "below",
      "overlay",
      "none"
    ]
  },
  "show_number": {
    "kind": "ja",
    "default": true,
    "limits": null
  },
  "show_time": {
    "kind": "ja",
    "default": true,
    "limits": null
  },
  "time_format": {
    "kind": "wahl",
    "default": "24h",
    "limits": [
      "24h",
      "12h"
    ]
  },
  "label_size": {
    "kind": "zahl",
    "default": 30,
    "limits": [
      10,
      90
    ]
  },
  "label_color": {
    "kind": "farbe",
    "default": "#FFFFFF",
    "limits": null
  },
  "watermark": {
    "kind": "wahl",
    "default": "viewer",
    "limits": [
      "viewer",
      "logo",
      "none"
    ]
  },
  "watermark_opacity": {
    "kind": "zahl",
    "default": 75,
    "limits": [
      0,
      100
    ]
  },
  "watermark_size": {
    "kind": "zahl",
    "default": 33,
    "limits": [
      10,
      80
    ]
  },
  "logo_url": {
    "kind": "url",
    "default": "",
    "limits": null
  },
  "header": {
    "kind": "ja",
    "default": false,
    "limits": null
  },
  "header_title": {
    "kind": "text",
    "default": "",
    "limits": 90
  },
  "header_subtitle": {
    "kind": "text",
    "default": "",
    "limits": 90
  },
  "header_height": {
    "kind": "zahl",
    "default": 110,
    "limits": [
      50,
      260
    ]
  },
  "header_background": {
    "kind": "farbe_leer",
    "default": "",
    "limits": null
  },
  "header_color": {
    "kind": "farbe",
    "default": "#FFFFFF",
    "limits": null
  },
  "qr_size": {
    "kind": "zahl",
    "default": 30,
    "limits": [
      15,
      60
    ]
  },
  "qr_position": {
    "kind": "wahl",
    "default": "br",
    "limits": [
      "br",
      "bl",
      "tr",
      "tl"
    ]
  },
  "qr_caption": {
    "kind": "text",
    "default": "",
    "limits": 40
  },
  "qr_caption_color": {
    "kind": "farbe",
    "default": "#002858",
    "limits": null
  },
  "new_badge": {
    "kind": "ja",
    "default": false,
    "limits": null
  },
  "new_minutes": {
    "kind": "zahl",
    "default": 10,
    "limits": [
      1,
      240
    ]
  },
  "new_text": {
    "kind": "text",
    "default": "NEW",
    "limits": 16
  },
  "accent": {
    "kind": "farbe",
    "default": "#FFBE3D",
    "limits": null
  },
  "ticker": {
    "kind": "ja",
    "default": true,
    "limits": null
  },
  "ticker_messages": {
    "kind": "liste",
    "default": [
      "Scan your photo..!"
    ],
    "limits": [
      8,
      140
    ]
  },
  "ticker_speed": {
    "kind": "zahl",
    "default": 100,
    "limits": [
      10,
      600
    ]
  },
  "ticker_background": {
    "kind": "farbe",
    "default": "#FFFFFF",
    "limits": null
  },
  "ticker_color": {
    "kind": "farbe",
    "default": "#000000",
    "limits": null
  },
  "ticker_size": {
    "kind": "zahl",
    "default": 40,
    "limits": [
      12,
      120
    ]
  },
  "ticker_height": {
    "kind": "zahl",
    "default": 40,
    "limits": [
      20,
      200
    ]
  },
  "ticker_position": {
    "kind": "wahl",
    "default": "bottom",
    "limits": [
      "bottom",
      "top"
    ]
  },
  "touch": {
    "kind": "ja",
    "default": false,
    "limits": null
  },
  "touch_seconds": {
    "kind": "zahl",
    "default": 30,
    "limits": [
      5,
      180
    ]
  },
  "touch_text": {
    "kind": "text",
    "default": "Scan with your phone camera to buy this photo",
    "limits": 120
  },
  "empty_text": {
    "kind": "text",
    "default": "",
    "limits": 120
  }
} as const;

export const PRESENTATION_PRESETS: Record<string, Record<string, unknown>> = {
  "classic": {},
  "signature": {
    "background": "#002858",
    "background2": "#00407F",
    "font": "bahnschrift",
    "gap": 22,
    "padding": 28,
    "radius": 16,
    "shadow": true,
    "card_background": "#0B3A6E",
    "label_mode": "overlay",
    "label_size": 24,
    "label_color": "#FFFFFF",
    "time_format": "12h",
    "watermark": "logo",
    "watermark_opacity": 40,
    "watermark_size": 24,
    "header": true,
    "header_height": 110,
    "header_background": "",
    "header_color": "#FFFFFF",
    "qr_size": 32,
    "qr_caption": "SCAN TO BUY",
    "qr_caption_color": "#002858",
    "new_badge": true,
    "accent": "#FFBE3D",
    "ticker": true,
    "ticker_background": "#FFBE3D",
    "ticker_color": "#002858",
    "ticker_size": 28,
    "ticker_height": 52,
    "ticker_speed": 110,
    "touch": true
  },
  "midnight": {
    "background": "#0B0F14",
    "background2": "#16202C",
    "font": "segoe",
    "gap": 20,
    "padding": 28,
    "radius": 14,
    "shadow": true,
    "card_background": "#141B24",
    "label_mode": "overlay",
    "label_size": 22,
    "label_color": "#E8EEF5",
    "watermark": "logo",
    "watermark_opacity": 32,
    "watermark_size": 24,
    "header": true,
    "header_color": "#E8EEF5",
    "qr_caption": "SCAN TO BUY",
    "qr_caption_color": "#0B0F14",
    "new_badge": true,
    "accent": "#4EA8FF",
    "ticker": true,
    "ticker_background": "#141B24",
    "ticker_color": "#E8EEF5",
    "ticker_size": 26,
    "ticker_height": 50,
    "touch": true
  },
  "clean": {
    "background": "#F4F6F8",
    "background2": "",
    "font": "segoe",
    "gap": 24,
    "padding": 32,
    "radius": 12,
    "shadow": true,
    "card_background": "#FFFFFF",
    "label_mode": "below",
    "label_size": 22,
    "label_color": "#1F2933",
    "watermark": "logo",
    "watermark_opacity": 35,
    "watermark_size": 24,
    "header": true,
    "header_color": "#1F2933",
    "qr_caption": "SCAN TO BUY",
    "qr_caption_color": "#1F2933",
    "new_badge": true,
    "accent": "#C2410C",
    "border_width": 0,
    "ticker": true,
    "ticker_background": "#1F2933",
    "ticker_color": "#FFFFFF",
    "ticker_size": 26,
    "ticker_height": 50,
    "touch": true
  }
};
