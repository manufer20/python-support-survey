# DTU Python Support Survey

A web-based student satisfaction survey application for DTU Python Support services.

## File Structure

```
├── index.html              # Main survey application (modular structure)
├── index-old.html          # Original monolithic version (backup)
├── assets/
│   └── images/            # Satisfaction rating face images (face1-5.png)
├── css/                   # Modular stylesheets
│   ├── main.css          # Base layout and utilities
│   ├── sidebar.css       # Sidebar navigation styles
│   ├── modal.css         # Modal and popup styles
│   ├── survey.css        # Survey form specific styles
│   └── kiosk.css         # Kiosk/tablet mode styles
├── js/                    # Modular JavaScript
│   ├── app.js            # Main application module (ES6)
│   ├── auth.js           # Authentication management
│   ├── building.js       # Building selection logic
│   ├── config.js         # Configuration constants
│   ├── errors.js         # Error handling utilities
│   ├── kiosk.js          # Kiosk/tablet mode management
│   ├── links.js          # One-time link generation
│   ├── qr.js             # QR code generation
│   ├── survey.js         # Survey form management
│   └── bundle.js         # Combined JavaScript (for file:// protocol)
├── components/            # HTML component templates
│   ├── analytics.html    # Analytics page component
│   ├── building-selection.html # Building selection component
│   ├── modals.html       # Modal dialogs component
│   ├── sidebar.html      # Sidebar navigation component
│   └── survey-form.html  # Survey form component
├── data/
│   └── courses.csv        # Course data for autocomplete
└── readme.md              # This documentation
```

## Features

- Building selection interface
- Student/Employee role selection  
- Satisfaction rating with visual feedback
- Course autocomplete from CSV data
- One-time link generation
- QR code generation for static URLs
- Analytics dashboard integration
- **Kiosk/Tablet Mode**: Fullscreen locked mode for public tablet deployment

## Usage

Open `index.html` in a web browser. The application includes:

1. **Building Selection**: Choose from predefined buildings or enter custom building number
2. **Survey Form**: Fill out satisfaction survey with student number/DTU credentials
3. **Analytics**: View survey statistics (requires authentication)

## Authentication

Password protection is currently commented out for development. Uncomment lines 328-336 in `index.html` to re-enable.

## Architecture

The application now uses a modular architecture with:

- **Separation of Concerns**: CSS, JavaScript, and HTML components are separated into logical modules
- **Class-based JavaScript**: ES6 classes for better code organization (AuthManager, BuildingManager, SurveyManager, etc.)
- **Modular CSS**: Separate stylesheets for different UI concerns
- **Component Templates**: Reusable HTML components (though currently inlined for file:// compatibility)

## Development

For **local development** with file:// protocol:
- Use `index.html` with `bundle.js` (pre-bundled JavaScript)
- Components are inlined in the main HTML file

For **server deployment**:
- Use modular ES6 modules in `js/` directory
- Components can be loaded dynamically from `components/` directory
- Enable HTTP server to avoid CORS restrictions

## Kiosk/Tablet Mode

The application includes a comprehensive kiosk mode for secure tablet deployment in public spaces.

### Activation

Kiosk mode can be activated in several ways:

1. **URL Parameter**: Add `?kiosk=1` or `?tablet=1` to the URL
2. **Toggle Button**: Click the floating lock button (🔒) in the bottom-right corner

### Features

- **Fullscreen Mode**: Automatically enters fullscreen
- **Navigation Hiding**: Hides sidebar, header, and navigation elements
- **Interaction Blocking**: Disables text selection, context menus, and keyboard shortcuts
- **Touch Optimization**: Larger touch targets and optimized layouts for tablets
- **Auto-return**: Returns to building selection after inactivity (optional)

### Security Features

- Prevents common keyboard shortcuts (F5, F11, F12, Ctrl+R, etc.)
- Blocks browser navigation and developer tools access
- Disables page refresh and tab switching
- Prevents accidental exit from kiosk mode

### Exit Mechanisms for Administrators

Since kiosk mode is designed to be secure, there are hidden exit mechanisms for staff:

1. **Keyboard Shortcut**: `Ctrl+Shift+Alt+E` - Secret key combination
2. **Hidden Tap Zone**: Click/tap the top-left corner 5 times within 3 seconds
3. **Temporary Exit Button**: A red "✕ Exit Kiosk" button appears after tap activation (auto-hides after 10 seconds)

### Implementation

Kiosk mode is implemented in `js/kiosk.js` and included in the bundled version. The CSS styles are in `css/kiosk.css`.

```javascript
// Manual activation
const kioskManager = new KioskManager();
kioskManager.enableKioskMode();
```

## Dependencies

- Tailwind CSS (via CDN)
- QR Code generation library (via CDN)
- PowerBI for analytics dashboard
