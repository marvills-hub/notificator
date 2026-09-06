# 🔔 Notificator

**Notificator** is a desktop notification aggregator built with **Angular** and **Tauri**.

It is designed to bring notifications from multiple communication services into one desktop application, starting with **Gmail**, while providing a persistent floating desktop widget for quick access.

The project uses Angular for the frontend and Rust/Tauri for native desktop integration.

---

# ✨ Current Features

- Native desktop application powered by Tauri
- Angular frontend
- Floating always-on-top notification widget
- Draggable desktop widget
- Click widget to show/hide the main window
- Unified inbox foundation
- Gmail integration
- Google OAuth authentication
- Firebase Authentication
- Open Gmail messages directly in Gmail
- Call notification simulation
- System console/logging
- Separate main window and floating widget
- Transparent desktop widget
- Desktop-first UI

---

# 🚧 Planned Features

- Gmail multi-account support
- Outlook integration
- WhatsApp integration
- Unified notification model
- Notification filtering
- Notification history
- Priority notifications
- Background synchronization
- Native desktop notifications
- Improved autostart
- Application updater
- Production installer

---

# 🛠️ Tech Stack

| Technology      | Purpose                                 |
| --------------- | --------------------------------------- |
| Angular         | Frontend                                |
| TypeScript      | Application logic                       |
| SCSS            | Styling                                 |
| Tauri 2         | Desktop application framework           |
| Rust            | Native backend                          |
| Firebase        | Authentication and application services |
| Gmail API       | Gmail integration                       |
| Google OAuth    | Gmail authorization                     |
| Node.js         | Frontend runtime/tooling                |
| npm             | Package management                      |
| NVM for Windows | Node version management                 |

---

# 📋 Development Requirements

Before running Notificator locally, the machine should have:

- Git
- Node.js
- npm
- NVM for Windows recommended
- Rust
- Cargo
- Microsoft Visual Studio Build Tools
- Windows SDK
- Microsoft Edge WebView2
- Internet access for dependency installation

---

# ⚠️ Required Node Version

Notificator currently requires a modern Node.js version compatible with its Angular CLI.

Use:

```text
Node.js 24.15.0 or newer Node 24.x
```

Node 20 is currently too old for the Angular version used by this project.

For example, this will fail:

```text
Node.js v20.19.0
```

with an Angular CLI error similar to:

```text
The Angular CLI requires a minimum Node.js version of v22.22.3
or v24.15.0 or v26.0.0.
```

For this project, Node 24 is recommended.

---

# 🚀 Fresh Clone Setup

This section should be followed when setting up Notificator on a new computer or after cloning the repository for the first time.

---

## 1. Clone the Repository

```bash
git clone <YOUR_REPOSITORY_URL>
```

Enter the project directory:

```bash
cd notificator
```

Example on Windows:

```powershell
cd C:\NOTIFICATOR\notificator
```

---

# 2. Check NVM

NVM for Windows is strongly recommended because different Angular projects may require different Node versions.

Check whether NVM is installed:

```powershell
nvm version
```

You can also see installed Node versions:

```powershell
nvm list
```

---

# 3. Install the Correct Node Version

For Notificator, install Node 24.15.0:

```powershell
nvm install 24.15.0
```

Activate it:

```powershell
nvm use 24.15.0
```

Verify:

```powershell
node --version
npm --version
```

Expected Node version:

```text
v24.15.0
```

or a newer compatible Node 24.x release.

---

# 4. If Node Still Shows an Older Version

Check which Node executable Windows is using:

```powershell
where.exe node
```

Then verify NVM:

```powershell
nvm list
```

Switch again:

```powershell
nvm use 24.15.0
```

Close and reopen PowerShell or VS Code if necessary.

Then check again:

```powershell
node --version
```

---

# 5. Install Node Dependencies

After cloning, the repository will not normally contain:

```text
node_modules/
```

Install dependencies with:

```powershell
npm install
```

If the repository has a valid committed `package-lock.json` and you want an exact clean install, you can use:

```powershell
npm ci
```

For normal development:

```powershell
npm install
```

is acceptable.

---

# 6. Verify Angular

Run:

```powershell
npx ng version
```

This confirms that the locally installed Angular CLI can run correctly.

---

# 🦀 Rust and Cargo Setup

Tauri requires Rust and Cargo.

---

## 7. Check Rust

Run:

```powershell
rustc --version
cargo --version
```

If both commands show version numbers, continue to the next section.

If PowerShell says:

```text
rustc is not recognized
```

or:

```text
cargo is not recognized
```

install Rust.

---

# 8. Install Rust

Use the official Rustup installer:

https://rustup.rs/

Install Rust using the default recommended configuration.

After installation, Rust normally installs tools under:

```text
%USERPROFILE%\.cargo\bin
```

Example:

```text
C:\Users\<username>\.cargo\bin
```

---

# 9. Verify That Cargo Was Installed

Run:

```powershell
Test-Path "$env:USERPROFILE\.cargo\bin\cargo.exe"
```

Expected:

```text
True
```

Then test Cargo directly:

```powershell
& "$env:USERPROFILE\.cargo\bin\cargo.exe" --version
```

Test Rust directly:

```powershell
& "$env:USERPROFILE\.cargo\bin\rustc.exe" --version
```

If these commands work but:

```powershell
cargo --version
```

does not, then Cargo is installed but missing from the current PATH.

---

# 10. Add Cargo to the Current PowerShell Session

Run:

```powershell
$env:Path += ";$env:USERPROFILE\.cargo\bin"
```

Then verify:

```powershell
cargo --version
rustc --version
```

---

# 11. Make Cargo PATH Permanent

If Cargo works only after manually modifying PATH, add it permanently.

Run:

```powershell
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")

if ($currentPath -notlike "*$env:USERPROFILE\.cargo\bin*") {
    [Environment]::SetEnvironmentVariable(
        "Path",
        "$currentPath;$env:USERPROFILE\.cargo\bin",
        "User"
    )
}
```

Then fully close and reopen:

- PowerShell
- Windows Terminal
- VS Code

Verify again:

```powershell
cargo --version
rustc --version
```

---

# ✅ Known Working Rust Setup

A working installation should produce something similar to:

```text
cargo 1.x.x
rustc 1.x.x
```

Exact versions may differ.

---

# 🪟 Windows Tauri Requirements

Tauri needs native Windows development tools.

Install Microsoft Visual Studio Build Tools with:

```text
Desktop development with C++
```

Make sure the installation includes:

- MSVC compiler
- Windows SDK
- C++ build tools

Tauri also requires Microsoft Edge WebView2.

WebView2 is already installed on most modern Windows systems.

---

# 🔎 Verify Tauri CLI

Check whether Tauri CLI exists:

```powershell
npm list @tauri-apps/cli
```

Then:

```powershell
npx tauri --version
```

If Tauri CLI is missing:

```powershell
npm install -D @tauri-apps/cli@latest
```

Then verify again:

```powershell
npx tauri --version
```

---

# ▶️ Run Notificator

Once Node, npm, Rust, Cargo, and the project dependencies are ready:

```powershell
npx tauri dev
```

Tauri will automatically run:

```text
npm run start
```

which starts Angular.

Angular normally starts on:

```text
http://localhost:4200
```

Tauri then opens the native Notificator desktop windows.

---

# ✅ Recommended Pre-Launch Check

Before running Notificator after a fresh clone:

```powershell
node --version
npm --version
rustc --version
cargo --version
npx tauri --version
```

All commands should succeed.

Then run:

```powershell
npx tauri dev
```

---

# 🧠 Fresh Clone Quick Start

If NVM and Rust are already installed correctly:

```powershell
git clone <YOUR_REPOSITORY_URL>

cd notificator

nvm use 24.15.0

npm install

node --version
npm --version
rustc --version
cargo --version

npx tauri dev
```

---

# 🆕 Fresh Machine Full Setup

For a completely new Windows machine:

```text
1. Install Git
2. Install NVM for Windows
3. Install Node 24.15.0 using NVM
4. Install Rust using rustup
5. Verify Cargo PATH
6. Install Visual Studio Build Tools
7. Install/verify Windows SDK
8. Verify WebView2
9. Clone Notificator
10. Run npm install
11. Run npx tauri dev
```

---

# 🛠️ Common Problems

## Error: `npm error could not determine executable to run`

Run:

```powershell
npm install
```

Then:

```powershell
npm list @tauri-apps/cli
```

Verify:

```powershell
npx tauri --version
```

If missing:

```powershell
npm install -D @tauri-apps/cli@latest
```

Then:

```powershell
npx tauri dev
```

---

# Error: `failed to run cargo metadata`

Example:

```text
failed to run 'cargo metadata' command
program not found
```

This means Tauri cannot find Cargo.

Check:

```powershell
cargo --version
```

If Cargo is not recognized:

```powershell
Test-Path "$env:USERPROFILE\.cargo\bin\cargo.exe"
```

If this returns:

```text
True
```

add Cargo to the current session:

```powershell
$env:Path += ";$env:USERPROFILE\.cargo\bin"
```

Then:

```powershell
cargo --version
rustc --version
```

Finally:

```powershell
npx tauri dev
```

---

# Error: `cargo is not recognized`

Try:

```powershell
& "$env:USERPROFILE\.cargo\bin\cargo.exe" --version
```

If this works, Cargo exists but PATH is incorrect.

Temporarily fix it:

```powershell
$env:Path += ";$env:USERPROFILE\.cargo\bin"
```

Then permanently add:

```text
%USERPROFILE%\.cargo\bin
```

to the Windows user PATH.

---

# Error: `rustc is not recognized`

Check:

```powershell
Test-Path "$env:USERPROFILE\.cargo\bin\rustc.exe"
```

If `False`, install Rust using Rustup.

If `True`, fix the PATH as described above.

---

# Error: Angular Requires a Newer Node Version

Example:

```text
Node.js version v20.19.0 detected.

The Angular CLI requires a minimum Node.js version of
v22.22.3 or v24.15.0 or v26.0.0.
```

Switch Node using NVM:

```powershell
nvm install 24.15.0
nvm use 24.15.0
```

Verify:

```powershell
node --version
```

Expected:

```text
v24.15.0
```

Then reinstall dependencies:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

Then:

```powershell
npx tauri dev
```

---

# Error: Node Version Did Not Change After `nvm use`

Check:

```powershell
where.exe node
```

Then:

```powershell
nvm list
```

Switch again:

```powershell
nvm use 24.15.0
```

Fully restart PowerShell or VS Code if required.

---

# Error After Changing Node Versions

When moving between significantly different Node versions, reinstall project dependencies.

PowerShell:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

Then:

```powershell
npx tauri dev
```

---

# Error: Angular Starts but Rust Compilation Fails

Check Rust first:

```powershell
rustc --version
cargo --version
```

Then:

```powershell
cd src-tauri
cargo check
```

Return:

```powershell
cd ..
```

Then:

```powershell
npx tauri dev
```

---

# Error: Port 4200 Already in Use

Find the process:

```powershell
netstat -ano | findstr :4200
```

Terminate the required process:

```powershell
taskkill /PID <PID> /F
```

Then:

```powershell
npx tauri dev
```

---

# 🧹 Clean Node Dependency Reset

If dependencies behave unexpectedly:

```powershell
Remove-Item -Recurse -Force node_modules
npm cache verify
npm install
```

Then:

```powershell
npx tauri dev
```

---

# 🧹 Clean Rust Reset

If Rust build artifacts become problematic:

```powershell
cd src-tauri

cargo clean
cargo check

cd ..
```

Then:

```powershell
npx tauri dev
```

Note that `cargo clean` removes compiled Rust files, so the next build may need to rebuild all Rust dependencies.

---

# 📦 Important Dependency Files

The repository should commit:

```text
package.json
package-lock.json
src-tauri/Cargo.toml
src-tauri/Cargo.lock
```

These files help ensure dependency consistency across machines.

Do not commit:

```text
node_modules/
src-tauri/target/
```

---

# 🌐 Run Angular Only

For frontend-only work:

```powershell
npm start
```

or:

```powershell
npx ng serve
```

Open:

```text
http://localhost:4200
```

Some features will not work correctly in browser-only mode because they depend on Tauri.

---

# 🖥️ Run Full Desktop Application

For normal development, always prefer:

```powershell
npx tauri dev
```

This runs both:

```text
Angular
+
Tauri/Rust
```

---

# 🏗️ Production Build

Build Angular:

```powershell
npm run build
```

Build the Tauri desktop application:

```powershell
npx tauri build
```

Native build artifacts are normally generated under:

```text
src-tauri/target/release/
```

Installers may be generated under:

```text
src-tauri/target/release/bundle/
```

depending on the Tauri configuration.

---

# 📁 Project Structure

```text
notificator/
│
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   └── services/
│   │   │
│   │   ├── layout/
│   │   │   ├── app-shell/
│   │   │   ├── sidebar/
│   │   │   └── topbar/
│   │   │
│   │   ├── pages/
│   │   └── ...
│   │
│   ├── assets/
│   ├── styles.scss
│   └── index.html
│
├── src-tauri/
│   ├── src/
│   ├── capabilities/
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── angular.json
├── package.json
├── package-lock.json
└── README.md
```

---

# 🪟 Application Windows

Notificator currently contains two main desktop windows.

## Main Window

Primary application interface.

Approximate configuration:

```text
1400 × 900
Minimum 1000 × 650
Resizable
Centered
```

---

## Floating Widget

The floating widget is designed to remain visible on the desktop.

Current behavior:

- Always on top
- Transparent background
- No standard decorations
- Hidden from taskbar
- Draggable
- Clickable
- Click to show main window
- Click again to hide main window

---

# 📧 Gmail API Setup

Enable Gmail API in the Google Cloud project associated with Notificator.

Navigate to:

```text
APIs & Services
→ Library
→ Gmail API
→ Enable
```

For development OAuth configuration:

```text
Google Auth Platform
→ Audience
```

Use:

```text
User type: External
Publishing status: Testing
```

Add your Gmail account under:

```text
Test users
```

Configure branding under:

```text
Google Auth Platform
→ Branding
```

Example:

```text
App name:
Notificator

Support email:
your email

Developer contact:
your email
```

---

# 🔥 Firebase Configuration

Notificator uses Firebase for authentication and application services.

After cloning, ensure the required Firebase configuration is available.

Never commit:

- Firebase service account keys
- private keys
- passwords
- refresh tokens
- OAuth secrets

---

# 🔑 Environment Files

If local configuration files are excluded from Git, they must be recreated after cloning.

Examples:

```text
.env
.env.local
src/environments/
```

If an example exists:

```powershell
Copy-Item .env.example .env
```

Then configure the local values.

---

# 🔐 Security

Never commit:

```text
Google OAuth client secrets
Google access tokens
Google refresh tokens
Firebase private keys
Firebase service account files
API secrets
Passwords
Authentication cookies
Production secrets
```

Before committing:

```powershell
git status
```

Review staged files:

```powershell
git diff --cached
```

---

# 🚫 Recommended `.gitignore`

Typical entries:

```gitignore
node_modules/
dist/
.angular/

src-tauri/target/

.env
.env.local

*.log

.DS_Store
Thumbs.db
```

Only ignore configuration files if they contain secrets or machine-specific information.

---

# 🌱 Git Workflow

Pull latest changes:

```powershell
git pull
```

Check modifications:

```powershell
git status
```

Stage:

```powershell
git add .
```

Commit:

```powershell
git commit -m "Describe changes"
```

Push:

```powershell
git push
```

---

# 📌 Useful Commands

| Task                 | Command               |
| -------------------- | --------------------- |
| List Node versions   | `nvm list`            |
| Install Node         | `nvm install 24.15.0` |
| Switch Node          | `nvm use 24.15.0`     |
| Check Node           | `node --version`      |
| Check npm            | `npm --version`       |
| Install dependencies | `npm install`         |
| Clean install        | `npm ci`              |
| Check Angular        | `npx ng version`      |
| Check Rust           | `rustc --version`     |
| Check Cargo          | `cargo --version`     |
| Check Tauri          | `npx tauri --version` |
| Run Angular          | `npm start`           |
| Run Notificator      | `npx tauri dev`       |
| Check Rust project   | `cargo check`         |
| Angular build        | `npm run build`       |
| Desktop build        | `npx tauri build`     |

---

# ✅ Developer Setup Checklist

After cloning, confirm:

```text
[ ] Git installed
[ ] NVM installed
[ ] Node 24.15.0+ active
[ ] npm working
[ ] npm dependencies installed
[ ] Rust installed
[ ] Cargo installed
[ ] Cargo available in PATH
[ ] Visual Studio Build Tools installed
[ ] Windows SDK installed
[ ] WebView2 available
[ ] Tauri CLI available
[ ] Firebase configuration available
[ ] Gmail OAuth development account configured
```

Then run:

```powershell
npx tauri dev
```

---

# 🗺️ Development Roadmap

## Phase 1 — Desktop Foundation

- [x] Angular application
- [x] Tauri integration
- [x] Main desktop window
- [x] Floating widget
- [x] Widget dragging
- [x] Always-on-top behavior
- [x] Main-window toggle
- [x] Call simulation

## Phase 2 — Gmail

- [x] Gmail API setup
- [x] Google OAuth development setup
- [x] Gmail authorization
- [x] Gmail inbox foundation
- [x] Open Gmail message externally
- [ ] Improve synchronization
- [ ] Gmail multi-account support
- [ ] Notification categorization

## Phase 3 — Unified Notifications

- [ ] Outlook
- [ ] WhatsApp
- [ ] Unified notification model
- [ ] Cross-provider inbox
- [ ] Filtering
- [ ] Priority notifications

## Phase 4 — Desktop Experience

- [ ] Improved autostart
- [ ] Background synchronization
- [ ] Native notifications
- [ ] Notification sounds
- [ ] Widget customization
- [ ] Provider status indicators

## Phase 5 — Release

- [ ] Production OAuth configuration
- [ ] Installer
- [ ] Application signing
- [ ] Release build testing
- [ ] Auto-update mechanism
- [ ] End-user installation documentation

---

# 📖 Documentation Status

This README currently focuses primarily on:

```text
Developer setup
Repository cloning
Development dependencies
Local configuration
Running Notificator from source
Common setup problems
```

When the application is ready for release, this documentation should be expanded to include:

```text
How to download Notificator
How to install Notificator
Windows installer instructions
First-time user setup
Account connection
Gmail connection
Application updates
Uninstallation
Release notes
Production troubleshooting
```

The development and end-user instructions should eventually be separated clearly so normal users do not need to install Node, Angular, Rust, Cargo, or Tauri.

---

# 🎯 Project Goal

Notificator aims to provide one lightweight desktop location for important communications.

```text
Gmail ──────┐
            │
Outlook ────┤
            ├──► NOTIFICATOR ──► Unified Desktop Notifications
WhatsApp ───┤
            │
Others ─────┘
```

The floating widget keeps Notificator easily accessible without requiring the main application window to remain open.

---

# 👨‍💻 Developer

**Marvills**

---

# 📄 License

Notificator is currently a private/personal development project.

Unless a separate license is provided, the source code should not be assumed to grant permission for redistribution, modification, or commercial reuse.

---

# 🔔 Notificator

**One place for the notifications that matter.**
