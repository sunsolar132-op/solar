# 🚀 Step-by-Step Guide: Running the WMS on a Fresh Computer

This document explains exactly how to move this project folder to a fresh computer and start it up in a few simple steps. 

Because the backend connects to a **Supabase PostgreSQL database in the cloud**, setup is extremely easy—**you do not need to install local Postgres, set up local databases, or execute any SQL tables manually!** The server will connect to your existing cloud database automatically.

---

## 📂 Step 1: Copy the Project Folder

To move the project to your new computer:

1. **(Highly Recommended)** To speed up the copy process drastically:
   * Go inside `inventory code/client/` and delete the `node_modules/` folder.
   * Go inside `inventory code/server/` and delete the `node_modules/` folder.
   * *Why?* The `node_modules` folders contain thousands of tiny files that make copying over USB or the network extremely slow. We will reinstall them fresh on the new computer in a single command.
2. Copy the entire **`inventory code`** parent folder to your new computer (e.g., place it on the Desktop).

---

## 💿 Step 2: Install Node.js on the New Computer

Node.js is the runtime required to execute both the frontend client and the backend server.

1. Go to the official website: **[https://nodejs.org](https://nodejs.org)**
2. Download and install the **LTS (Long Term Support)** version for Windows (e.g., Node v20 or newer).
3. Complete the installation wizard (just click "Next" through all steps).
4. Verify the installation by opening **Command Prompt** (cmd) or **PowerShell** and running:
   ```bash
   node -v
   npm -v
   ```
   *(If it prints version numbers, Node.js is ready to go!)*

---

## 📥 Step 3: Install Project Dependencies

Open **Command Prompt** or **PowerShell** on your new computer and navigate to the project directory:

1. **Go inside the root folder:**
   ```powershell
   cd "C:\Path\To\Your\Copied\Folder\inventory code"
   ```
   *(Replace with the actual path where you placed the folder, e.g., `cd "$HOME\Desktop\inventory code"`)*

2. **Install Server Dependencies:**
   ```powershell
   cd server
   npm install
   ```

3. **Install Client (Frontend) Dependencies:**
   ```powershell
   cd ../client
   npm install
   ```

---

## 🔑 Step 4: Verify Environment Variables

Since you copied the whole folder, your `.env` configuration file inside the `server/` directory is already there!

If you want to verify it, check `inventory code/server/.env` with a text editor. It should look like this:
```env
PORT=5000
DATABASE_URL=postgresql://postgres.udyhwppigclmqysugahb:CL7:25e4$_2XpdR@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
JWT_SECRET=warehouse_secret_key_2026
NODE_ENV=development
PGSSLMODE=require
```

* **Note:** The `DATABASE_URL` connects straight to your Supabase instance.
* The `JWT_SECRET` handles secure login sessions.

---

## 🚀 Step 5: Start the Development Server!

Now everything is configured! You can start both the **frontend** and **backend** at the same time in **one of two ways**:

### Option A: Double-Click the Launcher File (Easiest!)
1. Open the root **`inventory code`** folder.
2. Locate the file named **`start.bat`**.
3. Double-click **`start.bat`**!
* This will automatically open a command window and run the dev server for both the frontend and backend concurrently!

### Option B: Run a Single Terminal Command
1. Navigate back to the root `inventory code` folder:
   ```powershell
   cd ..
   ```
2. Start the combined launch script:
   ```powershell
   npm run dev
   ```

Both options use `concurrently` to automatically spawn:
* 🖥️ **Vite Frontend Client** on `http://localhost:5173`
* ⚙️ **Express Backend API Server** on `http://localhost:5000`

---

## 🌐 Step 6: Access the App

1. Open your web browser.
2. Go to **`http://localhost:5173`**
3. Log in with your standard credentials!

---

## 🛠️ Troubleshooting

### 1. "Port 5173 or Port 5000 is already in use"
* **Solution**: This happens if the server was not shut down cleanly or another app is using those ports. Close any open terminal windows, or open Task Manager and end any running `node.exe` tasks, then try `npm run dev` again.

### 2. "command not found: node" or "npm is not recognized"
* **Solution**: You need to restart your terminal window (Command Prompt or VS Code) after installing Node.js so it registers the new environment paths.
