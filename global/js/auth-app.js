// auth-app.js - Centralized Authentication Logic

// --- Shared Utilities ---

function showError(msg) {
    const el = document.getElementById('authError');
    if (el) {
        el.textContent = msg;
        el.style.display = 'block';
    } else {
        console.error(msg);
        alert(msg);
    }
}

function skipAuth() {
    localStorage.setItem('guestMode', 'true');
    window.location.href = '../../GardenBuddy AI/index.html';
}

// --- Login Logic ---

async function handleLogin(isContractor = false) {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const btn = document.getElementById('authMainBtn');
    const rememberEl = document.getElementById('rememberMe');
    const remember = rememberEl ? rememberEl.checked : false;

    if (!email || !password) {
        showError("Please enter credentials");
        return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.innerHTML = `<svg class="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 3C21 3 19 13 10 16C5 17.5 2 16 2 16C2 16 5.5 13.5 8 10C10.5 6.5 10 2 10 2C10 2 17 2 21 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 16L4 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Signing In...`;
    
    const errorEl = document.getElementById('authError');
    if(errorEl) errorEl.style.display = 'none';

    try {
        const data = await window.auth.signIn(email, password);

        if (data.session) {
            if (remember) {
                localStorage.setItem('gb_token', data.session.access_token);
                sessionStorage.removeItem('gb_token');
            } else {
                sessionStorage.setItem('gb_token', data.session.access_token);
                localStorage.removeItem('gb_token');
            }
            
            const role = data.user.user_metadata?.role || 'client';
            
            if (isContractor) {
                if (role !== 'contractor') {
                    await window.auth.signOut();
                    showError("Access Denied: Contractors only.");
                    btn.disabled = false;
                    btn.textContent = originalText;
                    return;
                }
                window.location.href = '../../GardenManager AI/index.html';
            } else {
                if (role === 'contractor') {
                     window.location.href = '../../GardenManager AI/index.html';
                } else {
                     window.location.href = '../../GardenBuddy AI/index.html';
                }
            }
        }
    } catch (error) {
        showError(error.message || "Login failed");
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// --- Register Logic ---

async function handleRegister(isContractor = false) {
    const name = document.getElementById('authName').value;
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const role = isContractor ? 'contractor' : 'client';
    const btn = document.getElementById('authRegisterBtn');

    if (!name || !email || !password) {
        showError("All fields are required");
        return;
    }

    btn.disabled = true;
    const originalText = btn.textContent;
    btn.innerHTML = `<svg class="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 3C21 3 19 13 10 16C5 17.5 2 16 2 16C2 16 5.5 13.5 8 10C10.5 6.5 10 2 10 2C10 2 17 2 21 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 16L4 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Creating Account...`;
    
    const errorEl = document.getElementById('authError');
    if(errorEl) errorEl.style.display = 'none';

    try {
        const data = await window.auth.signUp(email, password, name, role);

        if (data.session) {
            localStorage.setItem('gb_token', data.session.access_token);
            if (role === 'contractor') {
                window.location.href = '../../GardenManager AI/index.html';
            } else {
                window.location.href = '../../GardenBuddy AI/index.html';
            }
        } else {
            window.location.href = `check_email.html?email=${encodeURIComponent(email)}`;
        }
    } catch (error) {
        showError(error.message || "Registration failed");
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function handleResend(linkElement) {
    const email = document.getElementById('authEmail').value;
    if (!email) {
        showError("Please enter your email address above to resend verification.");
        return;
    }
    const originalText = linkElement.textContent;
    linkElement.textContent = "Sending...";
    linkElement.style.pointerEvents = "none";
    try {
        await window.auth.resendConfirmation(email);
        alert(`Verification email sent to ${email}! Please check your inbox.`);
    } catch (error) {
        showError(error.message || "Failed to resend email.");
    } finally {
        linkElement.textContent = originalText;
        linkElement.style.pointerEvents = "auto";
    }
}

// --- Password Management ---

async function handlePasswordReset() {
    const email = document.getElementById('resetEmail').value;
    const btn = document.getElementById('resetBtn');
    if (!email) { showError("Please enter your email"); return; }
    
    btn.disabled = true;
    btn.innerHTML = `<svg class="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 3C21 3 19 13 10 16C5 17.5 2 16 2 16C2 16 5.5 13.5 8 10C10.5 6.5 10 2 10 2C10 2 17 2 21 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 16L4 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Sending...`;
    
    try {
        await window.auth.resetPasswordForEmail(email);
        alert("Check your email for the password reset link!");
        window.location.href = 'login.html';
    } catch (error) {
        showError(error.message);
        btn.disabled = false;
        btn.textContent = "Send Reset Link";
    }
}

async function handlePasswordUpdate() {
    const password = document.getElementById('newPassword').value;
    const btn = document.getElementById('updateBtn');
    if (!password || password.length < 6) { showError("Password too short"); return; }
    
    btn.disabled = true;
    btn.innerHTML = `<svg class="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 3C21 3 19 13 10 16C5 17.5 2 16 2 16C2 16 5.5 13.5 8 10C10.5 6.5 10 2 10 2C10 2 17 2 21 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 16L4 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Updating...`;
    
    try {
        const data = await window.auth.updateUser({ password: password });
        alert("Password updated!");
        if (data.session) localStorage.setItem('gb_token', data.session.access_token);
        window.location.href = 'login.html';
    } catch (error) {
        showError(error.message);
        btn.disabled = false;
        btn.textContent = "Update Password";
    }
}

// --- Initialization ---

window.addEventListener('DOMContentLoaded', () => {
    // Login Pages
    const loginBtn = document.getElementById('authMainBtn');
    if (loginBtn) {
        const isContractor = document.body.classList.contains('contractor-page');
        loginBtn.onclick = () => handleLogin(isContractor);
    }

    // Register Pages
    const registerBtn = document.getElementById('authRegisterBtn');
    if (registerBtn) {
        const isContractor = document.body.classList.contains('contractor-page');
        registerBtn.onclick = () => handleRegister(isContractor);
    }

    // Forgot Password
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) resetBtn.onclick = handlePasswordReset;

    // Update Password
    const updateBtn = document.getElementById('updateBtn');
    if (updateBtn) updateBtn.onclick = handlePasswordUpdate;

    // Check Email Page
    if (window.location.pathname.includes('check_email.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const email = urlParams.get('email');
        if (email) {
            const el = document.getElementById('userEmail');
            if(el) el.textContent = email;
        }
    }

    // Email Confirmed Page
    const continueBtn = document.getElementById('continueBtn');
    if (continueBtn) {
        window.auth.getSession().then(({ data }) => {
            if (data && data.session) localStorage.setItem('gb_token', data.session.access_token);
        });
        
        continueBtn.onclick = async () => {
            continueBtn.disabled = true;
            continueBtn.innerHTML = `<svg class="spinner" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21 3C21 3 19 13 10 16C5 17.5 2 16 2 16C2 16 5.5 13.5 8 10C10.5 6.5 10 2 10 2C10 2 17 2 21 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 16L4 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Loading...`;
            const { data: { session } } = await window.auth.getSession();
            if (session) {
                localStorage.setItem('gb_token', session.access_token);
                const role = session.user.user_metadata?.role || 'client';
                window.location.href = role === 'contractor' ? '../../GardenManager AI/index.html' : '../../GardenBuddy AI/index.html';
            } else {
                window.location.href = 'login.html';
            }
        };
    }
    
    // Success Page
    if (window.location.pathname.includes('success.html')) {
        setTimeout(() => {
             window.location.href = '../../GardenBuddy AI/index.html';
        }, 3000);
    }
});

// Expose global functions
window.skipAuth = skipAuth;
window.handleResend = handleResend;
window.handlePaymentSuccess = function() {
    console.log("Payment success handled");
};