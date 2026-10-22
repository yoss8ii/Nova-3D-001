/**
 * NOVA 3D - envoi des factures depuis votre Gmail (Google Apps Script, gratuit, ~100 mails/jour).
 * 1. Allez sur https://script.google.com -> "Nouveau projet", collez ce fichier à la place du code existant.
 * 2. Remplacez SECRET ci-dessous par un mot de passe long de votre choix (le même sera donné à Cloudflare).
 * 3. Cliquez sur "Déployer" -> "Nouveau déploiement" -> type "Application Web" :
 *      Exécuter en tant que : Moi      |      Qui a accès : Tout le monde
 *    Autorisez l'accès à Gmail quand Google le demande ("Paramètres avancés" -> "Accéder à ... (non sécurisé)").
 * 4. Copiez l'URL de l'application Web (elle se termine par /exec).
 */
var SECRET = "CHANGEZ-MOI-mot-de-passe-long-et-secret";

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return out({ ok: false, error: "secret" });
    if (!d.to || !d.subject) return out({ ok: false, error: "missing fields" });
    var opts = { htmlBody: d.html || "", name: d.fromName || "NOVA 3D" };
    if (d.attachment && d.attachment.content) {
      opts.attachments = [Utilities.newBlob(Utilities.base64Decode(d.attachment.content), "application/pdf", d.attachment.name || "facture.pdf")];
    }
    GmailApp.sendEmail(d.to, d.subject, "Votre commande NOVA 3D est confirmée. Votre facture est jointe à ce message.", opts);
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
