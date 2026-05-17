// ==UserScript==
// @name         HabboCity Auto Register
// @namespace    habbocity.auto
// @version      2.3
// @description  Création auto de comptes HabboCity
// @match        https://habbocity.fr
// @match        https://habbocity.fr/
// @match        https://habbocity.fr/verify
// @match        https://habbocity.fr/verify/
// @exclude      https://habbocity.fr/hotel*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      gapi.hotmail007.com
// @connect      2captcha.com
// @connect      raw.githubusercontent.com
// @connect      discord.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const SECRET_KEYS = {
    CLIENT_KEY: "habbo_hotmail_key",
    TWO_CAPTCHA_KEY: "habbo_2captcha_key",
    DISCORD_WEBHOOK: "habbo_discord_webhook",
  };

  const CFG = {
    CLIENT_KEY: GM_getValue(SECRET_KEYS.CLIENT_KEY, ""),
    TWO_CAPTCHA_KEY: GM_getValue(SECRET_KEYS.TWO_CAPTCHA_KEY, ""),
    DISCORD_WEBHOOK: GM_getValue(SECRET_KEYS.DISCORD_WEBHOOK, ""),
    TURNSTILE_SITEKEY: "0x4AAAAAAA0kfR4DnDymQMoA",
    PAGE_URL: "https://habbocity.fr/",
    MAIL_TYPES: ["outlook", "hotmail"],
    HOTMAIL_API: "https://gapi.hotmail007.com",
    DELAY_BETWEEN_ACCOUNTS_MS: 5000,
    POOL_AUTO_REFILL_THRESHOLD: 1,
    POOL_REFILL_QUANTITY: 1,
  };

  function isConfigured() {
    return !!(CFG.CLIENT_KEY && CFG.TWO_CAPTCHA_KEY && CFG.DISCORD_WEBHOOK);
  }

  function openConfigDialog() {
    const k1 = prompt("Hotmail007 client key :", CFG.CLIENT_KEY);
    if (k1 === null) return false;
    const k2 = prompt("2captcha API key :", CFG.TWO_CAPTCHA_KEY);
    if (k2 === null) return false;
    const k3 = prompt("Discord webhook URL :", CFG.DISCORD_WEBHOOK);
    if (k3 === null) return false;
    GM_setValue(SECRET_KEYS.CLIENT_KEY, k1.trim());
    GM_setValue(SECRET_KEYS.TWO_CAPTCHA_KEY, k2.trim());
    GM_setValue(SECRET_KEYS.DISCORD_WEBHOOK, k3.trim());
    CFG.CLIENT_KEY = k1.trim();
    CFG.TWO_CAPTCHA_KEY = k2.trim();
    CFG.DISCORD_WEBHOOK = k3.trim();
    alert("Config sauvegardée.");
    return true;
  }

  function ensureConfigured() {
    if (!isConfigured()) {
      throw new Error('Config manquante — ouvre "Divers" → "Config" et renseigne les 3 clés.');
    }
  }

  const KEYS = {
    ACCOUNTS: "habbo_accounts",
    POOL: "habbo_mail_pool",
    USED: "habbo_used_mails",
    LAST_ACCOUNT: "habbo_last_account",
  };

  const SS_STEP1 = "habbo_step1_credentials";

  function loadStep1Creds() {
    try {
      return JSON.parse(sessionStorage.getItem(SS_STEP1) || "null");
    } catch (e) {
      return null;
    }
  }
  function saveStep1Creds(creds) {
    sessionStorage.setItem(SS_STEP1, JSON.stringify(creds));
  }
  function clearStep1Creds() {
    sessionStorage.removeItem(SS_STEP1);
  }

  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const cap = (w) => w[0].toUpperCase() + w.slice(1);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...args) => {
    console.log("[HabboReg]", ...args);
    if (typeof ui !== "undefined" && ui.logEl) ui.log(args.join(" "));
  };

  function setVal(sel, v) {
    const el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (!el) throw new Error("Element introuvable: " + sel);
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function gmFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opts.method || "GET",
        url,
        headers: opts.headers || {},
        data: opts.body,
        timeout: 30000,
        onload: (r) =>
          resolve({
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            text: () => r.responseText,
            json: () => {
              try {
                return JSON.parse(r.responseText);
              } catch (e) {
                return null;
              }
            },
          }),
        onerror: reject,
        ontimeout: () => reject(new Error("Timeout: " + url)),
      });
    });
  }

  const lsGet = (k) => JSON.parse(localStorage.getItem(k) || "null");
  const lsSet = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const COLORS = {
    success: 0x27ae60,
    fail: 0xe74c3c,
    warn: 0xf39c12,
    info: 0x4a90e2,
    start: 0x8e44ad,
  };

  async function sendDiscord(payload) {
    if (!CFG.DISCORD_WEBHOOK) return;
    try {
      await gmFetch(CFG.DISCORD_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.warn("[Discord] Webhook failed", e);
    }
  }

  async function notifyDiscord({
    type,
    title,
    description,
    fields = [],
    color,
  }) {
    const embed = {
      title: title,
      description: description || "",
      color: color || COLORS[type] || COLORS.info,
      fields: fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: `HabboCity Auto Register • ${(type || "info").toUpperCase()}`,
      },
    };
    await sendDiscord({ embeds: [embed] });
  }

  async function notifyAccountSuccess(account) {
    const m = account.mail;
    await notifyDiscord({
      type: "success",
      title: "Compte HabboCity créé avec succès",
      fields: [
        {
          name: "Pseudo",
          value: "`" + account.habbo.pseudo + "`",
          inline: true,
        },
        {
          name: "Mot de passe",
          value: "`" + account.habbo.password + "`",
          inline: true,
        },
        { name: "Genre", value: account.habbo.gender, inline: true },
        { name: "Email", value: "`" + m.email + "`", inline: false },
        { name: "Mail Password", value: "`" + m.mailPwd + "`", inline: true },
        { name: "Mail Type", value: m.mailType, inline: true },
        { name: "Client ID", value: "`" + m.clientId + "`", inline: false },
        {
          name: "Refresh Token",
          value: "```" + (m.refreshToken || "").slice(0, 1000) + "```",
          inline: false,
        },
        {
          name: "Code reçu",
          value: account.code ? "`" + account.code + "`" : "N/A",
          inline: true,
        },
        {
          name: "Créé le",
          value: new Date().toLocaleString("fr-FR"),
          inline: true,
        },
      ],
    });
  }

  async function notifyAccountFail({
    pseudo,
    password,
    gender,
    mail,
    error,
    step,
  }) {
    const fields = [
      {
        name: "Erreur",
        value: "```" + String(error).slice(0, 1000) + "```",
        inline: false,
      },
      { name: "Étape", value: step || "unknown", inline: true },
    ];
    if (pseudo)
      fields.push({
        name: "Pseudo tenté",
        value: "`" + pseudo + "`",
        inline: true,
      });
    if (password)
      fields.push({
        name: "MdP tenté",
        value: "`" + password + "`",
        inline: true,
      });
    if (gender) fields.push({ name: "Genre", value: gender, inline: true });
    if (mail) {
      fields.push({
        name: "Email",
        value: "`" + mail.email + "`",
        inline: false,
      });
      fields.push({
        name: "Mail Password",
        value: "`" + mail.mailPwd + "`",
        inline: true,
      });
      fields.push({ name: "Mail Type", value: mail.mailType, inline: true });
      if (mail.refreshToken)
        fields.push({
          name: "Refresh Token",
          value: "```" + mail.refreshToken.slice(0, 1000) + "```",
          inline: false,
        });
      if (mail.clientId)
        fields.push({
          name: "Client ID",
          value: "`" + mail.clientId + "`",
          inline: false,
        });
    }
    fields.push({
      name: "Date",
      value: new Date().toLocaleString("fr-FR"),
      inline: true,
    });

    await notifyDiscord({
      type: "fail",
      title: "Échec création compte HabboCity",
      fields,
    });
  }

  let WORDS;
  async function loadWords() {
    if (WORDS) return WORDS;
    const r = await gmFetch(
      "https://raw.githubusercontent.com/Taknok/French-Wordlist/master/francais.txt",
    );
    WORDS = r
      .text()
      .split("\n")
      .map((w) => w.trim().toLowerCase())
      .map((w) => w.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
      .filter((w) => w.length >= 4 && w.length <= 7 && /^[a-z]+$/.test(w))
      .filter((w) => /^[a-z]*[aeiouy][a-z]*$/i.test(w));
    log(`Wordlist chargée: ${WORDS.length} mots`);
    return WORDS;
  }

  function generateUsername(words) {
    return rand(words);
  }

  const generatePassword = (pseudo) => cap(pseudo) + "1234.";

  async function checkBalance() {
    const r = await gmFetch(
      `${CFG.HOTMAIL_API}/api/user/balance?clientKey=${CFG.CLIENT_KEY}`,
    );
    return r.json()?.data;
  }

  async function checkStock(mailType) {
    const r = await gmFetch(
      `${CFG.HOTMAIL_API}/api/mail/getStock?mailType=${encodeURIComponent(mailType)}`,
    );
    return r.json()?.data;
  }

  async function buyMails(quantity, mailType) {
    ensureConfigured();
    mailType = mailType || rand(CFG.MAIL_TYPES);
    log(`Achat de ${quantity} mail(s) (${mailType})...`);
    const r = await gmFetch(
      `${CFG.HOTMAIL_API}/api/mail/getMail?clientKey=${CFG.CLIENT_KEY}&mailType=${mailType}&quantity=${quantity}`,
    );
    const j = r.json();
    if (!j?.success)
      throw new Error(`hotmail007 KO (${mailType}): ${JSON.stringify(j)}`);
    return j.data.map((line) => {
      const [email, mailPwd, refreshToken, clientId] = line.split(":");
      return {
        email,
        mailPwd,
        refreshToken,
        clientId,
        mailType,
        fullString: line,
        status: "available",
        boughtAt: new Date().toISOString(),
      };
    });
  }

  async function readInbox(fullString, folder = "inbox") {
    const r = await gmFetch(
      `${CFG.HOTMAIL_API}/v1/mail/getFirstMail?clientKey=${CFG.CLIENT_KEY}&account=${encodeURIComponent(fullString)}&folder=${folder}`,
    );
    return r.json();
  }

  function isMailUsed(email) {
    const used = lsGet(KEYS.USED) || {};
    return !!used[email];
  }

  function markMailUsed(email, meta = {}) {
    const used = lsGet(KEYS.USED) || {};
    used[email] = {
      ...(used[email] || {}),
      ...meta,
      updatedAt: new Date().toISOString(),
    };
    lsSet(KEYS.USED, used);
  }

  function getPool() {
    return lsGet(KEYS.POOL) || [];
  }
  function savePool(p) {
    lsSet(KEYS.POOL, p);
    if (typeof ui !== "undefined")
      ui.updatePoolCount(p.filter((m) => m.status === "available").length);
  }

  async function refillPool(
    quantity = CFG.POOL_REFILL_QUANTITY,
    mailType = null,
  ) {
    const newMails = await buyMails(quantity, mailType);
    const pool = getPool();
    const unique = newMails.filter(
      (m) => !pool.some((p) => p.email === m.email) && !isMailUsed(m.email),
    );
    if (unique.length < newMails.length) {
      log(`${newMails.length - unique.length} doublon(s) écarté(s) à l'achat`);
    }
    pool.push(...unique);
    savePool(pool);
    log(
      `Pool: +${unique.length} mail(s) (dispo: ${pool.filter((m) => m.status === "available").length})`,
    );
    return unique;
  }

  async function validateMail(mail) {
    for (const folder of ["junkemail", "inbox"]) {
      try {
        const j = await readInbox(mail.fullString, folder);
        if (j && j.code === 0) return true;
      } catch (e) {}
    }
    return false;
  }

  async function getMailFromPool({ autoBuy = false } = {}) {
    let pool = getPool();
    let available = pool.filter(
      (m) => m.status === "available" && !isMailUsed(m.email),
    );

    if (available.length < CFG.POOL_AUTO_REFILL_THRESHOLD) {
      if (!autoBuy) {
        throw new Error(
          "Pool vide — achète des mails manuellement (section Mails) avant de continuer.",
        );
      }
      log(`Pool vide, achat d'un mail...`);
      await refillPool();
      pool = getPool();
      available = pool.filter(
        (m) => m.status === "available" && !isMailUsed(m.email),
      );
    }

    for (const mail of available) {
      if (isMailUsed(mail.email)) {
        mail.status = "duplicate_skipped";
        savePool(pool);
        continue;
      }
      log(`Validation ${mail.email}...`);
      const ok = await validateMail(mail);
      if (!ok) {
        log(`${mail.email} ne répond plus, marqué dead`);
        mail.status = "dead";
        markMailUsed(mail.email, { status: "dead" });
        savePool(pool);
        continue;
      }
      mail.status = "reserved";
      mail.reservedAt = new Date().toISOString();
      savePool(pool);
      markMailUsed(mail.email, { status: "reserved", mailType: mail.mailType });
      log(`Mail réservé: ${mail.email} (${mail.mailType})`);
      return mail;
    }

    throw new Error("Aucun mail valide trouvé dans le pool");
  }

  function updateMailStatus(email, status, extra = {}) {
    const pool = getPool();
    const m = pool.find((x) => x.email === email);
    if (m) {
      m.status = status;
      Object.assign(m, extra);
      savePool(pool);
    }
    markMailUsed(email, { status, ...extra });
  }

  async function waitForCode(fullString, timeoutSec = 120) {
    for (let i = 0; i < timeoutSec / 5; i++) {
      await sleep(5000);
      for (const folder of ["junkemail", "inbox"]) {
        try {
          const j = await readInbox(fullString, folder);
          if (!j?.data) continue;

          const raw = JSON.stringify(j.data);

          if (!/habbocitycontact@gmail\.com|frank de habbocity/i.test(raw)) {
            log("Mail non-HabboCity ignoré (" + folder + ")");
            continue;
          }

          let m = raw.match(/ci-dessous\s*:[\s\\nrt]*([A-F0-9]{6})\b/i);
          if (!m) m = raw.match(/\b(?=[A-F0-9]*[A-F])[A-F0-9]{6}\b/);

          if (m) {
            log("Code reçu (" + folder + "): " + m[1]);
            return m[1];
          }
        } catch (e) {}
      }
      log("Attente code... " + (i + 1) * 5 + "s");
    }
    throw new Error("Code timeout");
  }

  async function solveTurnstile() {
    ensureConfigured();
    log("Soumission 2captcha...");
    const sub = await gmFetch(
      `https://2captcha.com/in.php?key=${CFG.TWO_CAPTCHA_KEY}&method=turnstile&sitekey=${CFG.TURNSTILE_SITEKEY}&pageurl=${encodeURIComponent(CFG.PAGE_URL)}&json=1`,
    );
    const s = sub.json();
    if (s?.status !== 1)
      throw new Error("2captcha submit: " + (s?.request || "unknown"));
    const id = s.request;
    log(`2captcha id: ${id}`);

    for (let i = 0; i < 40; i++) {
      await sleep(5000);
      const res = (
        await gmFetch(
          `https://2captcha.com/res.php?key=${CFG.TWO_CAPTCHA_KEY}&action=get&id=${id}&json=1`,
        )
      ).json();
      if (res?.status === 1) {
        log(`Turnstile solved en ${(i + 1) * 5}s`);
        return res.request;
      }
      if (res?.request !== "CAPCHA_NOT_READY")
        throw new Error("2captcha: " + res?.request);
    }
    throw new Error("Turnstile timeout");
  }

  function injectTurnstileToken(token) {
    document
      .querySelectorAll('input[name="cf-turnstile-response"]')
      .forEach((i) => setVal(i, token));
    if (typeof window.turnstileCallback === "function")
      window.turnstileCallback(token);
  }

  async function sendVerifyEmail(email) {
    const fd = new FormData();
    fd.append("email", email);
    return fetch("/app/action/website/verify/ActionVerifyMailSend.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    }).then((r) => r.json());
  }

  async function checkVerifyCode(email, code) {
    const fd = new FormData();
    fd.append("email", email);
    fd.append("code", code);
    fd.append("email", email);
    return fetch("/app/action/website/verify/ActionVerifyMailCheck.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    }).then((r) => r.json());
  }

  async function loginAccount(pseudo, password) {
    log(`Login: ${pseudo}...`);
    const fd = new FormData();
    fd.append("username", pseudo);
    fd.append("password", password);
    const res = await fetch("/app/action/website/login/ActionLogin.php", {
      method: "POST",
      body: fd,
      credentials: "same-origin",
    }).then((r) => r.json());
    log("Login response: " + (res.response || JSON.stringify(res)));
    if (res.success) {
      window.location.href = "https://habbocity.fr/hotel";
    }
    return res;
  }

  function saveAccount(a) {
    const all = lsGet(KEYS.ACCOUNTS) || [];
    all.push({ ...a, createdAt: new Date().toISOString() });
    lsSet(KEYS.ACCOUNTS, all);
    if (typeof ui !== "undefined") ui.updateCount(all.length);
    if (typeof ui !== "undefined") ui.showLoginButton(a.habbo.pseudo, a.habbo.password);
  }
  function exportAccounts() {
    const data = localStorage.getItem(KEYS.ACCOUNTS) || "[]";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([data], { type: "application/json" }),
    );
    a.download = `habbo_accounts_${Date.now()}.json`;
    a.click();
  }

  async function resolveCredentials(mode, { reuse = false } = {}) {
    const onVerify = location.pathname.includes("verify");

    if (mode === "verify" || (mode === "full" && onVerify)) {
      let saved = loadStep1Creds();
      if (!saved?.pseudo || !saved?.password) {
        const inProgress = getPool().find(
          (m) =>
            ["step1_submitted", "email_sent", "code_received"].includes(
              m.status,
            ) &&
            m.pseudo &&
            m.password,
        );
        if (inProgress) {
          saved = {
            pseudo: inProgress.pseudo,
            password: inProgress.password,
            gender: inProgress.gender,
          };
          saveStep1Creds(saved);
        }
      }
      if (!saved?.pseudo || !saved?.password) {
        throw new Error(
          "Pas d'inscription en cours — lance d'abord l'étape 1 ou \"Tout en 1\".",
        );
      }
      log(`Identifiants: ${saved.pseudo}`);
      return saved;
    }

    if (reuse) {
      const saved = loadStep1Creds();
      if (saved?.pseudo && saved?.password) {
        log(`Reprise step1: ${saved.pseudo}`);
        return saved;
      }
    }

    clearStep1Creds();
    const words = await loadWords();
    const pseudo = generateUsername(words);
    const creds = {
      pseudo,
      password: generatePassword(pseudo),
      gender: rand(["male", "female"]),
    };
    saveStep1Creds(creds);
    log(`${creds.pseudo} | ${creds.password} | ${creds.gender}`);
    return creds;
  }

  const MAX_CAPTCHA_RETRY = 3;
  const MAX_PSEUDO_RETRY = 10;

  async function submitStep1WithRetry(creds) {
    let { pseudo, password, gender } = creds;

    for (let pseudoAttempt = 1; pseudoAttempt <= MAX_PSEUDO_RETRY; pseudoAttempt++) {
      for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRY; attempt++) {
        log(`Tentative step1 ${attempt}/${MAX_CAPTCHA_RETRY} (pseudo: ${pseudo})`);
        const token = await solveTurnstile();

        if (!document.querySelector("#regStep1Btn")?.offsetParent) {
          [...document.querySelectorAll("a,button,div,.btn")]
            .find((b) => /s'inscrire/i.test(b.textContent?.trim()))
            ?.click();
          await sleep(1000);
        }
        setVal('input[placeholder="Pseudonyme"]', pseudo);
        setVal('input[placeholder="Mot de passe"]', password);
        setVal('input[placeholder="Retape ton mot de passe"]', password);
        document.querySelector(`.gender-option.${gender}`)?.click();
        const cgu = document.querySelector('label input[type="checkbox"]');
        if (cgu && !cgu.checked) cgu.click();
        injectTurnstileToken(token);
        await sleep(500);

        document.querySelector("#regStep1Btn").click();
        log("Step1 submitted");

        let captchaError = false;
        let pseudoTaken = false;
        for (let i = 0; i < 15; i++) {
          await sleep(1000);
          if (location.pathname.includes("verify")) {
            creds.pseudo = pseudo;
            creds.password = password;
            saveStep1Creds(creds);
            return { success: true };
          }
          const errText = document.body.innerText.toLowerCase();
          if (/merci de valider le captcha|captcha invalide|veuillez valider/.test(errText)) {
            captchaError = true;
            break;
          }
          if (/pseudo.*(déjà|deja|utilisé|utilise|pris)|already.*taken/i.test(errText)) {
            pseudoTaken = true;
            break;
          }
        }

        if (pseudoTaken) {
          log(`Pseudo "${pseudo}" déjà pris, nouveau pseudo...`);
          const words = await loadWords();
          pseudo = generateUsername(words);
          password = generatePassword(pseudo);
          creds.pseudo = pseudo;
          creds.password = password;
          saveStep1Creds(creds);
          await sleep(1000);
          break;
        }

        if (captchaError) {
          log(`Captcha refusé (${attempt}/${MAX_CAPTCHA_RETRY})`);
          try { window.turnstile?.reset?.(); } catch (e) {}
          document
            .querySelectorAll('input[name="cf-turnstile-response"]')
            .forEach((i) => setVal(i, ""));
          await sleep(2000);
          continue;
        }
        throw new Error("Step1 échoué (erreur inconnue)");
      }
    }
    return { success: false, captchaBlocked: true };
  }

  async function runStep1Only({ reuse = false } = {}) {
    if (location.pathname.includes("verify")) {
      throw new Error('Tu es déjà sur /verify — utilise "Étape 2 — Verify".');
    }
    const creds = await resolveCredentials("step1", { reuse });
    saveStep1Creds(creds);
    const result = await submitStep1WithRetry(creds);
    if (!result.success) {
      throw new Error(
        'Captcha bloqué — identifiants sauvegardés, relance "Continuer step1" manuellement',
      );
    }
    log('Step1 OK — lance "Étape 2 — Verify" quand tu veux');
    if (typeof ui !== "undefined") ui.refreshPendingBanner();
    return creds;
  }

  async function runVerifyOnly() {
    if (!location.pathname.includes("verify")) {
      throw new Error(
        "Va sur https://habbocity.fr/verify puis lance l'étape 2.",
      );
    }
    const { pseudo, password, gender } = await resolveCredentials("verify");
    let mail = window.__currentMail;
    let currentStep = "init";
    let receivedCode = null;

    try {
      currentStep = "get_mail";
      log("Verify — récupération mail...");
      mail = await getMailFromPool({ autoBuy: true });
      window.__currentMail = mail;
      log(`${mail.email} (${mail.mailType})`);
      updateMailStatus(mail.email, "step1_submitted", {
        pseudo,
        password,
        gender,
      });

      currentStep = "send_verify_email";
      const sendRes = await sendVerifyEmail(mail.email);
      log("" + sendRes.response);
      if (!sendRes.success) {
        updateMailStatus(mail.email, "send_failed");
        throw new Error("Send KO: " + sendRes.response);
      }
      updateMailStatus(mail.email, "email_sent");

      currentStep = "wait_code";
      receivedCode = await waitForCode(mail.fullString);
      updateMailStatus(mail.email, "code_received", { code: receivedCode });

      currentStep = "check_code";
      const checkRes = await checkVerifyCode(mail.email, receivedCode);
      log("" + checkRes.response);
      if (!checkRes.success) {
        updateMailStatus(mail.email, "check_failed");
        throw new Error("Check KO: " + checkRes.response);
      }
      updateMailStatus(mail.email, "success", { pseudo });

      const account = {
        habbo: { pseudo, password, gender },
        mail,
        code: receivedCode,
        verified: true,
      };
      saveAccount(account);
      log(`SUCCESS: ${pseudo} | ${password}`);
      await notifyAccountSuccess(account);
      document.querySelector("#logoutButton2")?.click();
      await sleep(2000);
      window.__currentMail = null;
      clearStep1Creds();
      if (typeof ui !== "undefined") ui.refreshPendingBanner();
      return true;
    } catch (err) {
      await notifyAccountFail({
        pseudo,
        password,
        gender,
        mail,
        error: err.message || String(err),
        step: currentStep,
      });
      throw err;
    }
  }

  async function createAccount({ mode = "full", reuse = false } = {}) {
    if (mode === "step1") return runStep1Only({ reuse });
    if (mode === "verify") return runVerifyOnly();

    ensureConfigured();

    const onVerify = location.pathname.includes("verify");
    const { pseudo, password, gender } = await resolveCredentials("full", {
      reuse: !onVerify && reuse,
    });

    let mail = window.__currentMail;
    let currentStep = "init";
    let receivedCode = null;

    try {
      if (!onVerify) {
        currentStep = "step1";
        saveStep1Creds({ pseudo, password, gender });
        const result = await submitStep1WithRetry({ pseudo, password, gender });
        if (!result.success) {
          throw new Error(
            'Captcha bloqué — relance "Continuer step1" ou "Tout en 1" manuellement',
          );
        }
        log("Redirect /verify détecté");
      }

      if (!location.pathname.includes("verify")) {
        throw new Error(
          "Pas encore sur /verify — connecte-toi à l'étape 2 ou relance.",
        );
      }

      currentStep = "get_mail";
      log("Sur /verify, récupération mail...");
      mail = await getMailFromPool({ autoBuy: true });
      window.__currentMail = mail;
      log(`${mail.email} (${mail.mailType})`);
      updateMailStatus(mail.email, "step1_submitted", {
        pseudo,
        password,
        gender,
      });

      currentStep = "send_verify_email";
      const sendRes = await sendVerifyEmail(mail.email);
      log("" + sendRes.response);
      if (!sendRes.success) {
        updateMailStatus(mail.email, "send_failed");
        throw new Error("Send KO: " + sendRes.response);
      }
      updateMailStatus(mail.email, "email_sent");

      currentStep = "wait_code";
      receivedCode = await waitForCode(mail.fullString);
      updateMailStatus(mail.email, "code_received", { code: receivedCode });

      currentStep = "check_code";
      const checkRes = await checkVerifyCode(mail.email, receivedCode);
      log("" + checkRes.response);
      if (!checkRes.success) {
        updateMailStatus(mail.email, "check_failed");
        throw new Error("Check KO: " + checkRes.response);
      }
      updateMailStatus(mail.email, "success", { pseudo });

      const account = {
        habbo: { pseudo, password, gender },
        mail,
        code: receivedCode,
        verified: true,
      };
      saveAccount(account);
      log(`SUCCESS: ${pseudo} | ${password}`);
      await notifyAccountSuccess(account);

      document.querySelector("#logoutButton2")?.click();
      await sleep(2000);
      window.__currentMail = null;
      clearStep1Creds();
      if (typeof ui !== "undefined") ui.refreshPendingBanner();
      return true;
    } catch (err) {
      await notifyAccountFail({
        pseudo,
        password,
        gender,
        mail,
        error: err.message || String(err),
        step: currentStep,
      });
      throw err;
    }
  }

  async function buyOneMailToPool() {
    const added = await refillPool(1);
    if (!added.length) throw new Error("Aucun mail acheté");
    log(`${added[0].email} ajouté au pool`);
    return added[0];
  }

  async function reserveOneMailFromPool() {
    const mail = await getMailFromPool({ autoBuy: false });
    window.__lastReservedMail = mail;
    log(`Réservé: ${mail.email} | mdp: ${mail.mailPwd}`);
    return mail;
  }

  const ui = {
    logEl: null,
    stats: { ok: 0, fail: 0 },
    running: false,
    stopFlag: false,

    injectGlassFilter() {
      if (document.getElementById("habbo-glass-svg")) return;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.id = "habbo-glass-svg";
      svg.setAttribute("style", "position:absolute;width:0;height:0;pointer-events:none");
      svg.innerHTML = `
        <filter id="habbo-glass-distortion">
          <feTurbulence type="turbulence" baseFrequency="0.008" numOctaves="2" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="60"/>
        </filter>`;
      document.body.appendChild(svg);
    },

    init() {
      if (!isAllowedPage()) return;
      if (document.getElementById("habboReg")) return;
      this.injectGlassFilter();

      const css = `
#habboReg {
  position: fixed; top: 80px; right: 20px; width: 340px;
  z-index: 99999;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
  font-size: 12px; color: #fff;
  border-radius: 22px; overflow: hidden; isolation: isolate;
  box-shadow: 0 20px 60px -10px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08);
  animation: hbFadeIn .35s ease-out;
}
@keyframes hbFadeIn { from { opacity: 0; transform: translateY(-8px) scale(.98); } to { opacity: 1; transform: none; } }
#habboReg::before {
  content: ""; position: absolute; inset: 0; z-index: -2;
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  filter: url(#habbo-glass-distortion);
}
#habboReg::after {
  content: ""; position: absolute; inset: 0; z-index: -1;
  background:
    radial-gradient(circle at 20% 0%, rgba(91,157,255,.20), transparent 50%),
    radial-gradient(circle at 80% 100%, rgba(179,136,255,.20), transparent 50%),
    linear-gradient(135deg, rgba(20,20,35,.65), rgba(10,10,20,.78));
  box-shadow: inset 1px 1px 1px rgba(255,255,255,.55),
              inset -1px -1px 1px rgba(255,255,255,.05);
  border-radius: inherit;
}
#habboReg .hb-inner { padding: 16px; }
#habboReg h3 {
  margin: 0 0 12px; font-size: 14px; font-weight: 600; letter-spacing: .3px;
  background: linear-gradient(135deg, #fff, rgba(255,255,255,.7));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent;
}
#habboReg .stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;
  padding: 10px 8px; margin: 0 0 12px;
  background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 14px;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
#habboReg .stats > span {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-size: 9.5px; color: rgba(255,255,255,.55);
  letter-spacing: .4px; text-transform: uppercase; font-weight: 500;
  text-align: center;
}
#habboReg .stats > span span {
  display: block; margin-top: 4px; font-size: 16px; font-weight: 600;
  font-variant-numeric: tabular-nums; color: #fff;
}
#habboReg .stats .ok span  { color: #3ddc97; }
#habboReg .stats .ko span  { color: #ff6b6b; }
#habboReg .stats .info:nth-of-type(3) span { color: #5b9dff; }
#habboReg .stats .info:nth-of-type(4) span { color: #ffb84d; }
#habboReg .pending {
  display: none;
  padding: 9px 11px; margin: 0 0 10px;
  font-size: 10.5px; line-height: 1.4;
  color: #ffd99a;
  background: linear-gradient(135deg, rgba(255,184,77,.18), rgba(255,184,77,.08));
  border: 1px solid rgba(255,184,77,.35);
  border-radius: 12px;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
}
#habboReg .pending.visible { display: block; animation: hbFadeIn .25s ease-out; }
#habboReg .section { margin: 10px 0; }
#habboReg .section-title {
  font-size: 10px; color: rgba(255,255,255,.45);
  letter-spacing: .8px; text-transform: uppercase; font-weight: 600;
  margin: 0 0 8px 2px;
}
#habboReg button {
  position: relative;
  font-family: inherit; font-size: 11.5px; font-weight: 500;
  color: #fff;
  padding: 9px 12px; margin: 2px 0;
  border: 1px solid rgba(255,255,255,.18);
  border-radius: 10px;
  background: rgba(255,255,255,.08);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  cursor: pointer; overflow: hidden;
  transition: transform .15s ease, background .2s ease, border-color .2s ease, box-shadow .2s ease;
  box-shadow: inset 1px 1px 1px rgba(255,255,255,.12);
}
#habboReg button:hover {
  background: rgba(255,255,255,.16);
  border-color: rgba(255,255,255,.32);
  transform: translateY(-1px);
}
#habboReg button:active { transform: scale(.97); }
#habboReg button:disabled {
  opacity: .42; cursor: not-allowed; transform: none;
}
#habboReg button.sec { width: 100%; }
#habboReg button.main {
  width: 100%; padding: 12px; font-size: 13px; font-weight: 600;
  letter-spacing: .3px; margin: 4px 0;
  background: linear-gradient(135deg, rgba(61,220,151,.35), rgba(61,220,151,.18));
  border-color: rgba(61,220,151,.45);
  box-shadow: inset 1px 1px 1px rgba(255,255,255,.25), 0 4px 14px rgba(61,220,151,.18);
}
#habboReg button.main:hover {
  background: linear-gradient(135deg, rgba(61,220,151,.50), rgba(61,220,151,.28));
  box-shadow: inset 1px 1px 1px rgba(255,255,255,.3), 0 6px 22px rgba(61,220,151,.32);
}
#habboReg button.mail {
  background: linear-gradient(135deg, rgba(91,157,255,.30), rgba(91,157,255,.14));
  border-color: rgba(91,157,255,.40);
}
#habboReg button.mail:hover {
  background: linear-gradient(135deg, rgba(91,157,255,.42), rgba(91,157,255,.22));
}
#habboReg button.step {
  background: linear-gradient(135deg, rgba(86,219,189,.28), rgba(86,219,189,.13));
  border-color: rgba(86,219,189,.40);
}
#habboReg button.step:hover {
  background: linear-gradient(135deg, rgba(86,219,189,.40), rgba(86,219,189,.20));
}
#habboReg button.warn {
  background: linear-gradient(135deg, rgba(255,184,77,.30), rgba(255,184,77,.14));
  border-color: rgba(255,184,77,.40);
}
#habboReg button.warn:hover {
  background: linear-gradient(135deg, rgba(255,184,77,.42), rgba(255,184,77,.22));
}
#habboReg button.batch {
  background: linear-gradient(135deg, rgba(179,136,255,.30), rgba(179,136,255,.14));
  border-color: rgba(179,136,255,.40);
}
#habboReg button.batch:hover {
  background: linear-gradient(135deg, rgba(179,136,255,.42), rgba(179,136,255,.22));
}
#habboReg button.danger {
  background: linear-gradient(135deg, rgba(255,107,107,.30), rgba(255,107,107,.14));
  border-color: rgba(255,107,107,.40);
}
#habboReg button.danger:hover {
  background: linear-gradient(135deg, rgba(255,107,107,.42), rgba(255,107,107,.22));
}
#habboReg .row {
  display: grid; grid-template-columns: 1fr 1fr; gap: 5px;
  margin: 4px 0;
}
#habboReg .row button { margin: 0; }
#habboReg details {
  margin: 8px 0 4px;
  padding: 8px 10px;
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;
}
#habboReg summary {
  cursor: pointer;
  color: rgba(255,255,255,.55);
  font-size: 10.5px; font-weight: 600; letter-spacing: .5px;
  text-transform: uppercase;
  user-select: none; list-style: none;
  display: flex; align-items: center; justify-content: space-between;
}
#habboReg summary::-webkit-details-marker { display: none; }
#habboReg summary::after {
  content: "+"; font-size: 16px; line-height: 1;
  transition: transform .2s ease;
}
#habboReg details[open] summary::after { transform: rotate(45deg); }
#habboReg summary:hover { color: #fff; }
#habboReg details > .row { margin-top: 8px; }
#habboReg #habboLog {
  max-height: 200px; overflow-y: auto;
  background: rgba(0,0,0,.28);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;
  padding: 8px 10px; margin-top: 10px;
  font-family: "SF Mono", Menlo, Consolas, monospace;
  font-size: 10.5px; line-height: 1.5;
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
#habboReg #habboLog::-webkit-scrollbar { width: 4px; }
#habboReg #habboLog::-webkit-scrollbar-track { background: transparent; }
#habboReg #habboLog::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,.20); border-radius: 2px;
}
#habboReg #habboLog div {
  margin-bottom: 3px; word-wrap: break-word; color: rgba(255,255,255,.85);
}
#habboReg #habboLog div:first-child {
  color: #fff; animation: hbLogIn .25s ease-out;
}
@keyframes hbLogIn { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: none; } }
`;
      const style = document.createElement("style");
      style.textContent = css;
      document.head.appendChild(style);

      const div = document.createElement("div");
      div.id = "habboReg";
      div.innerHTML = `
        <div class="hb-inner">
          <h3>HabboCity · Auto Register</h3>

          <div id="rConfigWarn" class="pending"></div>

          <div class="stats">
            <span class="ok">OK<span id="rOk">0</span></span>
            <span class="ko">Fail<span id="rFail">0</span></span>
            <span class="info">Total<span id="rTotal">0</span></span>
            <span class="info">Pool<span id="rPool">0</span></span>
          </div>

          <div id="rPending" class="pending"></div>

          <div class="section">
            <div class="section-title">Mails</div>
            <button id="rBuy1" class="sec mail">Acheter 1 mail vers pool</button>
            <button id="rRefill" class="sec warn">Acheter N mails vers pool</button>
            <button id="rReserve" class="sec mail">Réserver 1 mail du pool</button>
            <div class="row">
              <button id="rBalance">Balance API</button>
              <button id="rStock">Stock API</button>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Comptes</div>
            <button id="rStep1" class="sec step">Étape 1 — Inscription</button>
            <button id="rStep2" class="sec step">Étape 2 — Verify mail</button>
            <button id="rBtnFull" class="main">Tout en 1</button>
            <button id="rContinue" class="sec warn" style="display:none">Continuer inscription en cours</button>
            <button id="rLogin" class="sec step" style="display:none">Se connecter au dernier compte</button>
            <button id="rBtnN" class="sec batch">Batch</button>
          </div>

          <details>
            <summary>Divers</summary>
            <button id="rConfig" class="sec mail">Config (clés API)</button>
            <div class="row">
              <button id="rExport">Export JSON</button>
              <button id="rTestDiscord">Test Discord</button>
            </div>
            <button id="rClear" class="sec danger" style="margin-top:5px">Reset tout</button>
          </details>

          <div id="habboLog"></div>
        </div>
      `;
      document.body.appendChild(div);
      this.logEl = document.getElementById("habboLog");

      const run = (fn) => async () => {
        if (this.running) return;
        this.setRunning(true);
        try {
          await fn();
        } catch (e) {
          this.log("[ERR] " + e.message);
        }
        this.setRunning(false);
        this.refreshPendingBanner();
      };

      document.getElementById("rBuy1").onclick = run(async () => {
        if (!confirm("Acheter 1 mail et l'ajouter au pool ?")) return;
        await buyOneMailToPool();
      });
      document.getElementById("rRefill").onclick = run(async () => {
        const n = parseInt(prompt("Combien de mails ?", "5"), 10);
        if (!n || n < 1) return;
        if (!confirm("Acheter " + n + " mail(s) ?")) return;
        await refillPool(n);
      });
      document.getElementById("rReserve").onclick = run(() =>
        reserveOneMailFromPool(),
      );
      document.getElementById("rBalance").onclick = run(async () => {
        this.log("Balance: $" + (await checkBalance()));
      });
      document.getElementById("rStock").onclick = run(async () => {
        for (const t of CFG.MAIL_TYPES) {
          this.log(t + ": " + (await checkStock(t)) + " en stock");
        }
      });

      document.getElementById("rStep1").onclick = run(async () => {
        this.log("[RUN] Etape 1");
        await createAccount({ mode: "step1" });
        this.log("[OK] Etape 1 - va sur /verify puis Etape 2");
      });
      document.getElementById("rStep2").onclick = run(async () => {
        this.log("[RUN] Etape 2");
        await createAccount({ mode: "verify" });
        this.stats.ok++;
        document.getElementById("rOk").textContent = this.stats.ok;
        this.log("[OK] Compte cree");
      });
      document.getElementById("rBtnFull").onclick = () => this.runFull();
      document.getElementById("rContinue").onclick = run(async () => {
        const saved = loadStep1Creds();
        if (!saved) throw new Error("Rien a continuer");
        this.log("[RESUME] " + saved.pseudo);
        if (location.pathname.includes("verify")) {
          await createAccount({ mode: "verify" });
          this.stats.ok++;
          document.getElementById("rOk").textContent = this.stats.ok;
        } else {
          await createAccount({ mode: "step1", reuse: true });
        }
      });
      document.getElementById("rLogin").onclick = async () => {
        const btn = document.getElementById("rLogin");
        const pseudo = btn.dataset.pseudo;
        const password = btn.dataset.password;
        if (!pseudo) { this.log("[ERR] Aucun compte à connecter"); return; }
        await loginAccount(pseudo, password);
      };
      document.getElementById("rBtnN").onclick = () =>
        this.runBatchWithConfirm();
      document.getElementById("rExport").onclick = exportAccounts;
      document.getElementById("rTestDiscord").onclick = run(async () => {
        await notifyDiscord({
          type: "info",
          title: "Test Discord",
          description: "Webhook OK",
          fields: [
            {
              name: "Heure",
              value: new Date().toLocaleString("fr-FR"),
              inline: true,
            },
          ],
        });
        this.log("[OK] Discord");
      });
      document.getElementById("rConfig").onclick = () => {
        if (openConfigDialog()) this.refreshConfigBanner();
      };
      document.getElementById("rClear").onclick = () => {
        if (confirm("Reset comptes + pool + historique ?")) {
          [KEYS.ACCOUNTS, KEYS.POOL, KEYS.USED].forEach((k) =>
            localStorage.removeItem(k),
          );
          clearStep1Creds();
          this.updateCount(0);
          this.updatePoolCount(0);
          this.refreshPendingBanner();
          this.log("[OK] Reset");
        }
      };

      this.updateCount((lsGet(KEYS.ACCOUNTS) || []).length);
      this.updatePoolCount(
        getPool().filter((m) => m.status === "available").length,
      );
      this.refreshPendingBanner();
      this.refreshConfigBanner();
      this.restoreLoginButton();
    },

    refreshConfigBanner() {
      const el = document.getElementById("rConfigWarn");
      if (!el) return;
      if (isConfigured()) {
        el.classList.remove("visible");
      } else {
        el.textContent = 'Config manquante — clique "Divers" → "Config" pour renseigner les 3 clés (Hotmail007, 2captcha, webhook Discord).';
        el.classList.add("visible");
      }
    },

    refreshPendingBanner() {
      const el = document.getElementById("rPending");
      const btn = document.getElementById("rContinue");
      const saved = loadStep1Creds();
      if (!el || !btn) return;
      if (saved?.pseudo) {
        el.textContent = `En cours: ${saved.pseudo} — rien ne démarre seul. Clique "Continuer" si tu veux reprendre.`;
        el.classList.add("visible");
        btn.style.display = "block";
      } else {
        el.classList.remove("visible");
        btn.style.display = "none";
      }
    },

    showLoginButton(pseudo, password) {
      const btn = document.getElementById("rLogin");
      if (!btn) return;
      btn.dataset.pseudo = pseudo;
      btn.dataset.password = password;
      btn.textContent = `Se connecter → ${pseudo}`;
      btn.style.display = "block";
      lsSet(KEYS.LAST_ACCOUNT, { pseudo, password });
    },

    restoreLoginButton() {
      const last = lsGet(KEYS.LAST_ACCOUNT);
      if (last?.pseudo) this.showLoginButton(last.pseudo, last.password);
    },

    log(msg) {
      if (!this.logEl) return;
      const d = document.createElement("div");
      d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      this.logEl.prepend(d);
      while (this.logEl.children.length > 60) this.logEl.lastChild.remove();
    },

    updateCount(n) {
      const e = document.getElementById("rTotal");
      if (e) e.textContent = n;
    },
    updatePoolCount(n) {
      const e = document.getElementById("rPool");
      if (e) e.textContent = n;
    },

    setRunning(state) {
      this.running = state;
      document.querySelectorAll("#habboReg button").forEach((b) => {
        b.disabled = state;
      });
      const full = document.getElementById("rBtnFull");
      if (full) full.textContent = state ? "En cours..." : "Tout en 1";
    },

    async runFull() {
      if (this.running) return;
      this.setRunning(true);
      this.log("[RUN] Tout en 1");
      try {
        await createAccount({ mode: "full" });
        this.stats.ok++;
        document.getElementById("rOk").textContent = this.stats.ok;
        this.log("[OK] Compte cree");
      } catch (e) {
        this.stats.fail++;
        document.getElementById("rFail").textContent = this.stats.fail;
        this.log("[ERR] " + e.message);
        if (location.pathname.includes("verify")) {
          document.querySelector("#logoutButton2")?.click();
          await sleep(2000);
        }
      }
      this.setRunning(false);
      this.refreshPendingBanner();
    },

    async runBatchWithConfirm() {
      if (this.running) return;

      const nStr = prompt(
        "Combien de comptes créer ?\n(annule pour ne rien faire)",
        "5",
      );
      if (nStr === null) return;
      const n = parseInt(nStr);
      if (!n || n < 1 || n > 100) {
        alert("Quantité invalide (1-100)");
        return;
      }

      const cost = (n * 0.002).toFixed(3);
      const captchaCost = (n * 0.003).toFixed(3);
      const ok = confirm(
        `CONFIRMATION BATCH\n\n` +
          `Tu vas créer ${n} compte(s) HabboCity.\n` +
          `Coût mails : ~$${cost}\n` +
          `Coût 2captcha : ~$${captchaCost}\n` +
          `Durée estimée : ~${Math.ceil(n * 1.5)} min\n\n` +
          `Sans rotation d'IP, risque de ban apres 5-10 comptes.\n\n` +
          `Confirmer ?`,
      );
      if (!ok) {
        this.log("Batch annulé");
        return;
      }

      this.setRunning(true);
      this.stopFlag = false;
      this.log(`Batch de ${n} compte(s) lancé`);

      await notifyDiscord({
        type: "start",
        title: "Batch démarré",
        fields: [
          { name: "Quantité", value: String(n), inline: true },
          { name: "Coût mails estimé", value: `$${cost}`, inline: true },
          {
            name: "Coût 2captcha estimé",
            value: `$${captchaCost}`,
            inline: true,
          },
        ],
      });

      const stopBtn = document.createElement("button");
      stopBtn.textContent = "STOP BATCH";
      stopBtn.className = "danger";
      stopBtn.style.cssText = "width:100%; margin:4px 0; padding:8px;";
      stopBtn.onclick = () => {
        this.stopFlag = true;
        this.log("Stop demandé...");
        stopBtn.disabled = true;
      };
      document.getElementById("rBtnFull").after(stopBtn);

      let batchOk = 0,
        batchFail = 0;
      for (let i = 0; i < n; i++) {
        if (this.stopFlag) {
          this.log("Batch stoppé");
          break;
        }
        this.log(`--- Compte ${i + 1}/${n} ---`);
        try {
          await createAccount({ mode: "full" });
          this.stats.ok++;
          batchOk++;
          document.getElementById("rOk").textContent = this.stats.ok;
        } catch (e) {
          this.stats.fail++;
          batchFail++;
          document.getElementById("rFail").textContent = this.stats.fail;
          this.log("[ERR] " + e.message);
          if (location.pathname.includes("verify")) {
            document.querySelector("#logoutButton2")?.click();
            await sleep(2000);
          }
        }
        if (i < n - 1 && !this.stopFlag)
          await sleep(CFG.DELAY_BETWEEN_ACCOUNTS_MS);
      }

      stopBtn.remove();
      this.log(`Batch terminé (${batchOk} OK / ${batchFail} fail)`);

      await notifyDiscord({
        type: batchFail === 0 ? "success" : "warn",
        title: "Batch terminé",
        fields: [
          { name: "Succes", value: String(batchOk), inline: true },
          { name: "Echecs", value: String(batchFail), inline: true },
          {
            name: "Total tenté",
            value: `${batchOk + batchFail}/${n}`,
            inline: true,
          },
        ],
      });

      this.setRunning(false);
    },
  };

  function isAllowedPage() {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    return path === "/" || path === "/verify";
  }

  function boot() {
    document.getElementById("habboReg")?.remove();
    if (!isAllowedPage()) return;
    ui.init();
  }

  if (document.readyState === "complete") boot();
  else window.addEventListener("load", boot);

  window.HabboReg = {
    createAccount,
    runStep1Only,
    runVerifyOnly,
    buyOneMailToPool,
    reserveOneMailFromPool,
    refillPool,
    checkBalance,
    checkStock,
    exportAccounts,
    getPool,
    loadStep1Creds,
    clearStep1Creds,
    notifyDiscord,
    CFG,
  };
})();
