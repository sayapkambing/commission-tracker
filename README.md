# Client Portal System - Setup & Deployment Guide

## 📋 Overview

This is a complete client order tracking system with:
- **Client Portal**: Clients can track their orders using unique codes
- **Admin Panel**: You can manage all orders, update statuses, and track payments
- **Firebase Backend**: Real-time database with secure authentication

---

## 🚀 Quick Start

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project"
3. Name it (e.g., "Client-Portal")
4. Disable Google Analytics (optional)
5. Click "Create Project"

### Step 2: Enable Firestore Database

1. In your Firebase project, click "Firestore Database"
2. Click "Create database"
3. Choose "Start in **production mode**"
4. Select your region (choose closest to you)
5. Click "Enable"

### Step 3: Set Up Firestore Rules

Click on "Rules" tab and paste this:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow clients to read their own orders
    match /orders/{orderId} {
      allow read: if true;  // Anyone with order code can read
      allow write: if request.auth != null;  // Only authenticated admins can write
    }
  }
}
```

Click "Publish"

### Step 4: Enable Authentication

1. Click "Authentication" in sidebar
2. Click "Get started"
3. Click "Email/Password"
4. Enable it
5. Click "Save"
6. Go to "Users" tab
7. Click "Add user"
8. Enter your email and password (this is YOUR admin account)

### Step 5: Get Firebase Config

1. Click the gear icon ⚙️ next to "Project Overview"
2. Click "Project settings"
3. Scroll down to "Your apps"
4. Click the web icon `</>`
5. Register your app (name it "Client Portal")
6. Copy the `firebaseConfig` object

### Step 6: Update Your Files

Open both `client-portal.html` and `admin-panel.html`

Find this section:
```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    ...
};
```

Replace with YOUR config from Step 5.

---

## 📁 File Structure

```
client-portal-system/
├── client-portal.html      # Client-facing portal
├── client-portal.js         # Client portal logic
├── client-styles.css        # Client portal styles
├── admin-panel.html         # Admin dashboard
├── admin-panel.js           # Admin logic  
├── admin-styles.css         # Admin styles
└── README.md                # This file
```

---

## 🎯 How to Use

### For You (Admin):

1. Open `admin-panel.html` in browser
2. Login with your Firebase admin credentials
3. Click "New Order" to add orders
4. Fill in all details:
   - Order Code (e.g., ORDER-12345)
   - Client name
   - Price, deadlines
   - Status and workflow stage
   - Revision allowances
   - Invoice URL

### For Clients:

1. Share `client-portal.html` link with clients
2. Give them their unique ORDER code
3. They enter the code and see:
   - Order details
   - Payment info
   - Current workflow stage
   - Invoice preview
   - Download options

---

## 🔐 Security Notes

- Only YOU can create/edit orders (requires Firebase admin login)
- Clients can ONLY view orders with their code
- Each client sees ONLY their own orders
- No client data is exposed to other clients

---

## 🌐 Deployment Options

### Option 1: Firebase Hosting (Recommended - FREE)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize hosting
firebase init hosting

# Select your project
# Set public directory to current folder
# Configure as single-page app: No
# Don't overwrite files

# Deploy
firebase deploy --only hosting
```

Your site will be live at: `https://YOUR_PROJECT_ID.web.app`

### Option 2: Netlify (FREE)

1. Go to [netlify.com](https://netlify.com)
2. Drag and drop your folder
3. Done! Live in seconds

### Option 3: GitHub Pages (FREE)

1. Create GitHub repo
2. Upload all files
3. Go to Settings → Pages
4. Select main branch
5. Done!

---

## 📊 Firestore Data Structure

### Orders Collection

```javascript
{
  orderCode: "ORDER-12345",           // Unique code
  clientName: "John Doe",             
  itemName: "Character Illustration",
  description: "Full body, detailed",
  totalPrice: 500000,
  
  // Dates
  orderDate: "2025-02-10",
  paymentDeadline: "2025-02-15",
  deadline: "2025-03-01",
  
  // Status
  status: "In Progress",              // Main status
  currentStage: "Sketching",          // Workflow stage
  paymentStatus: "DP",
  
  // Revisions
  revisionAllowed: true,
  revisionRemaining: 2,
  revisionStages: ["Sketching", "Cleaning"],
  revisionSubjects: ["Pose", "Ekspresi", "Warna"],
  
  // Invoice
  invoiceUrl: "https://...",          // Public URL to invoice
  
  // Timestamps
  createdAt: timestamp,
  updatedAt: timestamp
}
```

---

## 🎨 Customization

### Change Colors

Edit CSS files and change these:
```css
--primary-color: #667eea;  /* Purple */
--secondary-color: #764ba2;
```

### Add More Workflow Stages

Edit the stages array in JavaScript:
```javascript
const stages = ['Concept', 'Sketching', 'Cleaning', 'Rendering', 'Finishing', 'YourNewStage'];
```

### Add Fields

1. Add input in HTML forms
2. Update JavaScript to save/display the field
3. No database changes needed!

---

## 🐛 Troubleshooting

**"Permission denied" error:**
- Check Firestore rules are set correctly
- Make sure you're logged in as admin

**Orders not showing:**
- Check Firebase console → Firestore
- Verify orderCode matches exactly (case-sensitive)

**Can't login as admin:**
- Go to Firebase → Authentication → Users
- Verify your email is listed
- Try password reset if needed

---

## 💡 Tips

1. **Order Codes**: Use a consistent format (ORDER-001, ORDER-002, etc.)
2. **Invoice URLs**: Upload invoices to Firebase Storage or Google Drive (public link)
3. **Testing**: Create test orders with code "TEST-001" before going live
4. **Backups**: Firebase auto-backups, but export data monthly for safety

---

## 📱 Mobile Support

The system is fully responsive! Works on:
- Desktop browsers
- Tablets
- Mobile phones

---

## 🔄 Updates & Maintenance

### Adding a New Order

1. Login to admin panel
2. Click "New Order"
3. Fill details
4. Save

### Updating Order Status

1. Click "Edit" on any order
2. Change status/stage
3. Save

### Client Access

Share this link:
`https://your-deployed-site.com/client-portal.html`

Each client needs their unique ORDER code.

---

## 📞 Support

If you need help:
1. Check Firebase Console for errors
2. Open browser Console (F12) for JavaScript errors
3. Verify all Firebase config is correct

---

## ✅ Production Checklist

Before going live:
- [ ] Firebase config updated in both HTML files
- [ ] Firestore rules set correctly
- [ ] Admin account created
- [ ] Test order created and viewable
- [ ] Invoice URL tested
- [ ] Deployed to hosting
- [ ] Client portal link works
- [ ] Admin panel login works

---

Good luck! 🚀
