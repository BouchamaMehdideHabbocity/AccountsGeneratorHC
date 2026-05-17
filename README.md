```
    __  __      __    __          _______ __
   / / / /___ _/ /_  / /_  ____  / ____(_) /___  __
  / /_/ / __ `/ __ \/ __ \/ __ \/ /   / / __/ / / /
 / __  / /_/ / /_/ / /_/ / /_/ / /___/ / /_/ /_/ /
/_/ /_/\__,_/_.___/_.___/\____/\____/_/\__/\__, /
                Auto Register             /____/
```

---

## Fonctionnement

```
┌─────────���───┐     ┌──────────┐     ┌───���──────┐     ┌───────────┐
│  Generer    │────>│ Resoudre │────>│ Soumettre│────>│ Verifier  │
��   Pseudo    │     │ Captcha  │     │ Etape 1  │     │   Email   │
└─────────────┘     └──────────┘     └──────────┘     └─────┬─────┘
                                                             │
                    ┌──────────��     ┌──────────┐            │
                    │ Notif    │<────│  Compte  │<───────────┘
                    │ Discord  │     │   Cree   │
                    └──────────┘     └──────────┘
```

---

## Fonctionnalites

```
[+] Inscription auto          pipeline complet, sans intervention
[+] Resolution captcha        2captcha Turnstile
[+] Pool de mails             achat, validation, anti-doublons
[+] Mode batch                creer N comptes a la suite
[+] Retry pseudo              si pris, en genere un nouveau
[+] Notifications Discord     succes / echec / batch
[+] Connexion 1 clic          se login au dernier compte cree
[+] Export JSON               telecharger tous les comptes
```

---

## Installation

```
1. Installer Tampermonkey
2. Coller citytamper.js comme nouveau script
3. Aller sur habbocity.fr
4. Le panneau apparait en haut a droite
5. Cliquer "Divers" > "Config" > entrer les 3 cles :

   ┌────────────────────────────────────────────┐
   │  Cle Hotmail007     ->  achat de mails     │
   │  Cle 2captcha       ->  resolution captcha │
   │  Webhook Discord    ->  notifications      │
   └────────────────────────────────────────────┘
```

---

## Utilisation

```
 Auto          "Tout en 1"        -> 1 compte, full auto
 Batch         "Batch"            -> N comptes, bouton stop
 Manuel        "Etape 1" puis "Etape 2" sur /verify
 Connexion     "Se connecter"     -> login auto dernier compte
```

---

## Format des comptes

```json
{
  "pseudo": "lune",
  "password": "Lune1234.",
  "gender": "female",
  "email": "xxx@outlook.com",
  "verified": true
}
```

---

## Attention

```
[!] utilise un proxy de preference
[!] Couts : ~$0.002/mail + ~$0.003/captcha par compte
```

---

## Stack

```
Tampermonkey  ·  Hotmail007 API  ·  2captcha  ·  Discord Webhooks
```
