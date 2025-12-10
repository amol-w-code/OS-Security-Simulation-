/**
 * SysCall Secure - Educational OS Simulation
 * 
 * This file contains all the simulated "Kernel" logic, including:
 * 1. Authentication (User Management)
 * 2. File System (In-Memory Tree)
 * 3. Process Management
 * 4. System Call Interface (The API)
 * 5. Audit Logging (Persistence)
 * 6. UI Controller (DOM Interaction)
 */

// ==========================================
// 1. Audit Logger Module
// ==========================================
class AuditLogger {
    constructor() {
        this.storageKey = 'os_simulation_logs';
        this.logs = this.loadLogs();
    }

    loadLogs() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('Failed to load logs', e);
            return [];
        }
    }

    log(user, syscall, params, status, message = '') {
        const entry = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            user: user,
            syscall: syscall,
            params: JSON.stringify(params),
            status: status, // 'ALLOWED' | 'DENIED' | 'ERROR'
            message: message
        };

        this.logs.unshift(entry); // Add to beginning
        this.saveLogs();
        return entry;
    }

    saveLogs() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (e) {
            console.error('Failed to save logs', e);
        }
    }

    getLogs() {
        return this.logs;
    }

    clearLogs() {
        this.logs = [];
        this.saveLogs();
    }
}

// ==========================================
// 2. File System Module (In-Memory)
// ==========================================
class VirtualFileSystem {
    constructor() {
        // Simple tree structure. 
        // type: 'dir' | 'file'
        // children: {} for dirs
        // content: string for files
        this.root = {
            type: 'dir',
            name: '/',
            children: {
                'home': {
                    type: 'dir',
                    children: {
                        'admin': {
                            type: 'dir',
                            children: {
                                'secret.txt': { type: 'file', content: 'CONFIDENTIAL: Project Blue Book' },
                                'notes.md': { type: 'file', content: '# To Do\n1. Secure the kernel\n2. Audit logs' }
                            }
                        },
                        'guest': {
                            type: 'dir',
                            children: {}
                        }
                    }
                },
                'etc': {
                    type: 'dir',
                    children: {
                        'passwd': { type: 'file', content: 'admin:x:0:0:root:/home/admin:/bin/sh' },
                        'config': { type: 'file', content: 'mode=secure' }
                    }
                },
                'var': {
                    type: 'dir',
                    children: {
                        'log': { type: 'dir', children: {} }
                    }
                }
            }
        };
    }

    resolvePath(path) {
        if (path === '/') return this.root;

        const parts = path.split('/').filter(p => p.length > 0);
        let current = this.root;

        for (const part of parts) {
            if (current.type !== 'dir' || !current.children[part]) {
                return null;
            }
            current = current.children[part];
        }
        return current;
    }

    getParentPath(path) {
        const parts = path.split('/').filter(p => p.length > 0);
        if (parts.length === 0) return null; // Root has no parent in this simplified view
        parts.pop();
        return parts.length === 0 ? '/' : '/' + parts.join('/');
    }

    getName(path) {
        const parts = path.split('/').filter(p => p.length > 0);
        return parts[parts.length - 1];
    }

    fileExists(path) {
        return this.resolvePath(path) !== null;
    }

    createFile(path, content = '') {
        const parentPath = this.getParentPath(path);
        const filename = this.getName(path);
        const parent = this.resolvePath(parentPath);

        if (!parent || parent.type !== 'dir') throw new Error('Parent directory does not exist');
        if (parent.children[filename]) throw new Error('File already exists');

        parent.children[filename] = {
            type: 'file',
            content: content
        };
        return true;
    }

    readFile(path) {
        const node = this.resolvePath(path);
        if (!node) throw new Error('File not found');
        if (node.type !== 'file') throw new Error('Is a directory');
        return node.content;
    }

    writeFile(path, content) {
        const node = this.resolvePath(path);
        if (!node) throw new Error('File not found');
        if (node.type !== 'file') throw new Error('Is a directory');
        node.content = content;
        return true;
    }

    deleteFile(path) {
        const parentPath = this.getParentPath(path);
        const filename = this.getName(path);
        const parent = this.resolvePath(parentPath);

        if (!parent || !parent.children[filename]) throw new Error('File not found');
        delete parent.children[filename];
        return true;
    }

    listDir(path) {
        const node = this.resolvePath(path);
        if (!node) throw new Error('Directory not found');
        if (node.type !== 'dir') throw new Error('Not a directory');

        return Object.keys(node.children).map(key => {
            const child = node.children[key];
            return {
                name: key,
                type: child.type,
                size: child.type === 'file' ? child.content.length : Object.keys(child.children).length
            };
        });
    }
}

// ==========================================
// 3. Kernel Wrapper (System Calls)
// ==========================================
class Kernel {
    constructor() {
        this.fs = new VirtualFileSystem();
        this.logger = new AuditLogger();
        this.currentUser = null;
        this.processes = [];
        this.nextPid = 100;

        // Start init process
        this.createProcess('init', 'system');
    }

    // --- Authentication ---
    login(username, password) {
        // Hardcoded fake auth
        if (username === 'admin' && password === 'admin123') {
            this.currentUser = { username: 'admin', role: 'root' };
            this.logger.log('system', 'login', { username }, 'ALLOWED', 'Auth successful');
            return true;
        } else if (username === 'user' && password === 'user123') {
            this.currentUser = { username: 'user', role: 'user' };
            this.logger.log('system', 'login', { username }, 'ALLOWED', 'Auth successful');
            return true;
        }
        this.logger.log('system', 'login', { username }, 'DENIED', 'Invalid credentials');
        return false;
    }

    logout() {
        if (this.currentUser) {
            this.logger.log(this.currentUser.username, 'logout', {}, 'ALLOWED');
            this.currentUser = null;
        }
    }

    checkAuth() {
        if (!this.currentUser) throw new Error('Not logged in');
    }

    isAdmin() {
        return this.currentUser && this.currentUser.role === 'root';
    }

    // --- System Call Dispatcher ---
    // In a real OS, this would be an interrupt handler.
    // Here, it's a method that wraps operations with logging and security checks.
    syscall(name, ...args) {
        try {
            this.checkAuth();
            const user = this.currentUser.username;

            // Authorization Check (Simple RBAC simulation)
            // For now, admin can do everything. Non-admin handling can be added here.

            let result;
            let status = 'ALLOWED';
            let message = '';

            // Map syscall names to internal methods
            switch (name) {
                case 'get_info':
                    result = {
                        os: 'SysCall Secure v1.0',
                        uptime: performance.now(),
                        user: this.currentUser
                    };
                    break;

                case 'create_process':
                    if (!this.isAdmin()) throw new Error('Permission denied: requires root');
                    result = this.createProcess(args[0], user);
                    break;

                case 'kill_process':
                    if (!this.isAdmin()) throw new Error('Permission denied: requires root');
                    result = this.killProcess(args[0]);
                    break;

                case 'open_file': // Simulates stat/check existence
                    // Start reading args
                    if (!this.fs.fileExists(args[0])) throw new Error('File not found');
                    result = 'File Descriptor [Mocked]'; // In real OS, returns an int fd
                    break;

                case 'read_file':
                    // args[0] in this high-level sim is path
                    // Restricted files
                    if (args[0].includes('/shadow')) {
                        throw new Error('Permission denied');
                    }
                    result = this.fs.readFile(args[0]);
                    break;

                case 'write_file':
                    // args[0] = path, args[1] = content
                    if (!this.isAdmin() && args[0].startsWith('/etc')) throw new Error('Permission denied: /etc is read-only');
                    result = this.fs.writeFile(args[0], args[1]);
                    break;

                case 'create_file':
                    result = this.fs.createFile(args[0], args[1]);
                    break;

                case 'list_dir':
                    result = this.fs.listDir(args[0]);
                    break;

                default:
                    throw new Error('Unknown system call');
            }

            // Log Success
            this.logger.log(user, name, args, status, 'Success');
            return result;

        } catch (error) {
            // Log Failure
            const user = this.currentUser ? this.currentUser.username : 'anonymous';
            const logStatus = error.message.includes('Permission') ? 'DENIED' : 'ERROR';
            this.logger.log(user, name, args, logStatus, error.message);
            throw error;
        }
    }

    // Internal Process Management
    createProcess(name, owner) {
        const pid = this.nextPid++;
        this.processes.push({ pid, name, owner, status: 'running' });
        return pid;
    }

    killProcess(pid) {
        const idx = this.processes.findIndex(p => p.pid === parseInt(pid));
        if (idx === -1) throw new Error('Process not found');
        this.processes.splice(idx, 1);
        return true;
    }
}

// ==========================================
// 4. UI Controller
// ==========================================
class UIController {
    constructor() {
        this.kernel = new Kernel();
        this.views = {
            login: document.getElementById('login-view'),
            dashboard: document.getElementById('dashboard-view')
        };
        this.initEventListeners();
    }

    initEventListeners() {
        // Login Form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const user = document.getElementById('username').value;
            const pass = document.getElementById('password').value;

            if (this.kernel.login(user, pass)) {
                this.switchView('dashboard');
                this.updateDashboard();
            } else {
                const err = document.getElementById('login-error');
                err.classList.remove('hidden');
                setTimeout(() => err.classList.add('hidden'), 3000);
            }
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.kernel.logout();
            this.switchView('login');
            // clear fields
            document.getElementById('username').value = '';
            document.getElementById('password').value = '';
        });

        // Navigation
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });

        // Initialize Syscall UI Generator
        this.initSyscallUI();

        // Log actions
        document.getElementById('clear-logs-btn').addEventListener('click', () => {
            this.kernel.logger.clearLogs();
            this.renderLogs();
        });
    }

    switchView(viewName) {
        Object.values(this.views).forEach(el => el.classList.remove('active', 'hidden'));
        Object.values(this.views).forEach(el => el.classList.add('hidden'));

        this.views[viewName].classList.remove('hidden');
        this.views[viewName].classList.add('active');
    }

    switchTab(tabId) {
        // Update nav buttons
        document.querySelectorAll('.nav-item').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('hidden');
            if (content.id === `tab-${tabId}`) content.classList.remove('hidden');
        });

        // Refresh dynamic content
        if (tabId === 'logs') this.renderLogs();
        if (tabId === 'filesystem') this.renderFileSystem();
        this.updateStats();
    }

    updateDashboard() {
        this.updateStats();
        this.updateUserProfile();
        // default to overview
        this.switchTab('overview');
    }

    updateUserProfile() {
        const user = this.kernel.currentUser;
        if (!user) return;

        // Update Avatar
        const avatarEl = document.querySelector('.user-profile .avatar');
        avatarEl.innerText = user.username.substring(0, 2).toUpperCase();

        // Update Name and Role
        document.querySelector('.user-profile .user-name').innerText = user.username;
        document.querySelector('.user-profile .user-role').innerText = user.role === 'root' ? 'Superuser (Root)' : 'Standard User';
    }

    updateStats() {
        const stats = {
            syscalls: this.kernel.logger.getLogs().length,
            violations: this.kernel.logger.getLogs().filter(l => l.status === 'DENIED').length,
            processes: this.kernel.processes.length
        };

        document.getElementById('stat-syscall-count').innerText = stats.syscalls;
        document.getElementById('stat-violations').innerText = stats.violations;
        document.getElementById('stat-processes').innerText = stats.processes;
    }

    // --- Syscall Interface Logic ---
    initSyscallUI() {
        const definitions = [
            { name: 'get_info', params: [] },
            { name: 'create_process', params: [{ name: 'process_name', placeholder: 'e.g. firefox' }] },
            { name: 'kill_process', params: [{ name: 'pid', placeholder: 'Process ID' }] },
            { name: 'list_dir', params: [{ name: 'path', placeholder: '/home/admin' }] },
            { name: 'create_file', params: [{ name: 'path', placeholder: '/home/admin/new.txt' }, { name: 'content', placeholder: 'Hello World' }] },
            { name: 'read_file', params: [{ name: 'path', placeholder: '/etc/passwd' }] },
            { name: 'write_file', params: [{ name: 'path', placeholder: '/home/admin/file.txt' }, { name: 'content', placeholder: 'New Content' }] },
            { name: 'open_file', params: [{ name: 'path', placeholder: '/home/admin/file.txt' }] },
        ];

        const listEl = document.getElementById('syscall-list-items');
        const formContainer = document.getElementById('syscall-form-container');

        definitions.forEach(def => {
            const li = document.createElement('li');
            li.innerText = `${def.name}(${def.params.map(p => p.name).join(', ')})`;
            li.addEventListener('click', () => {
                // Highlight active
                document.querySelectorAll('.syscall-list li').forEach(l => l.classList.remove('active'));
                li.classList.add('active');

                // Render Form
                this.renderSyscallForm(def, formContainer);
            });
            listEl.appendChild(li);
        });
    }

    renderSyscallForm(def, container) {
        container.innerHTML = `
            <h3>Configure ${def.name}</h3>
            <form id="syscall-exec-form">
                ${def.params.map((p, index) => `
                    <div class="input-group">
                        <label>${p.name}</label>
                        <input type="text" name="param${index}" placeholder="${p.placeholder}" required>
                    </div>
                `).join('')}
                <button type="submit" class="btn primary">Execute System Call</button>
            </form>
        `;

        document.getElementById('syscall-exec-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const args = [];
            def.params.forEach((_, idx) => args.push(formData.get(`param${idx}`)));

            this.executeSyscall(def.name, args);
        });
    }

    executeSyscall(name, args) {
        const outputEl = document.getElementById('syscall-output');
        const cmdEl = document.getElementById('console-cmd');
        const resEl = document.getElementById('console-result');

        outputEl.classList.remove('hidden');
        cmdEl.innerText = `${name}(${args.map(a => `'${a}'`).join(', ')})`;
        resEl.innerHTML = '<span style="color: grey">Executing...</span>';

        // Simulate small delay for realism
        setTimeout(() => {
            try {
                const result = this.kernel.syscall(name, ...args);

                let displayResult = result;
                if (typeof result === 'object') displayResult = JSON.stringify(result, null, 2);

                resEl.innerHTML = `<span class="success-msg">Result:</span>\n${displayResult}`;
            } catch (error) {
                resEl.innerHTML = `<span class="error-msg">Error: ${error.message}</span>`;
            }
            // Update other tabs in background
            this.updateStats();
        }, 300);
    }

    // --- Audit Log Render ---
    renderLogs() {
        const tbody = document.getElementById('audit-log-body');
        tbody.innerHTML = '';
        const logs = this.kernel.logger.getLogs();

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #94a3b8;">No logs found</td></tr>';
            return;
        }

        logs.forEach(log => {
            const tr = document.createElement('tr');
            // pretty date
            const date = new Date(log.timestamp).toLocaleTimeString();

            const statusClass = log.status === 'ALLOWED' ? 'allowed' : 'denied';

            tr.innerHTML = `
                <td class="timestamp">${date}</td>
                <td>${log.user}</td>
                <td style="font-family: monospace">${log.syscall}</td>
                <td style="font-family: monospace; font-size: 0.75rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title='${log.params}'>${log.params}</td>
                <td><span class="status-badge ${statusClass}">${log.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- File System Render ---
    renderFileSystem() {
        const container = document.getElementById('fs-browser');
        container.innerHTML = this.renderDir(this.kernel.fs.root);
    }

    renderDir(node, path = '/') {
        // Recursive HTML generator
        if (node.type !== 'dir') return '';

        let html = '';
        Object.keys(node.children).forEach(key => {
            const child = node.children[key];
            const fullPath = path === '/' ? `/${key}` : `${path}/${key}`;
            const icon = child.type === 'dir' ? '📁' : '📄';

            html += `
                <div class="fs-item ${child.type === 'dir' ? 'fs-dir' : 'fs-file'}">
                    <span class="fs-icon">${icon}</span>
                    <span class="fs-name">${key}</span>
                    ${child.type === 'dir' ? `<div class="fs-children">${this.renderDir(child, fullPath)}</div>` : ''}
                </div>
            `;
        });
        return html;
    }
}

// Start the Application
window.addEventListener('DOMContentLoaded', () => {
    window.app = new UIController();
});

// fixed logic for system call by admin.
// fixed logic for system call by standard user.