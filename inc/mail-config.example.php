<?php
/**
 * Template for the enquiry form's mail settings.
 *
 * Copy this file to inc/mail-config.php on the server and fill in the real
 * values. The real file is git-ignored because it holds a live mailbox
 * password, so it must be uploaded separately and never committed.
 */

return [
    // Where enquiries land.
    'to'      => 'info@example.com',
    'bcc'     => '',
    'subject' => 'Website enquiry',

    // The envelope sender. Keep this on your own domain so SPF and DMARC
    // pass; the visitor's address goes into Reply-To instead.
    'from_email' => 'no-reply@example.com',
    'from_name'  => 'Website',

    // Outgoing SMTP.
    'host'     => 'mail.example.com',
    'port'     => 465,
    'secure'   => 'ssl',   // 465 is implicit TLS. Use 'tls' only with port 587.
    'username' => 'no-reply@example.com',
    'password' => 'PUT-THE-REAL-PASSWORD-HERE',
    'timeout'  => 20,

    /*
     * Shared mail servers sometimes present a certificate that does not match
     * mail.<domain>. If the log shows a handshake or certificate error, set
     * this to false. Everything stays encrypted either way; only the identity
     * check is skipped.
     */
    'verify_cert' => true,

    // Failed sends are appended here. Keep it inside /inc so it is not public.
    'log' => __DIR__ . '/mail-error.log',
];
