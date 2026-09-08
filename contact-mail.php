<?php
/**
 * GR Global — enquiry form handler.
 *
 * Called by fetch() from js/main.js and answers JSON. Without JavaScript the
 * same POST still works and the visitor is redirected instead.
 */

declare(strict_types=1);

$config = require __DIR__ . '/inc/mail-config.php';
require __DIR__ . '/inc/smtp.php';

const THANK_YOU = 'thank-you.html';

$isAjax = isset($_SERVER['HTTP_X_REQUESTED_WITH'])
    && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';

/** End the request in whichever form the caller expects. */
function respond(bool $ok, string $message, bool $isAjax): void
{
    if ($isAjax) {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        http_response_code($ok ? 200 : 422);
        echo json_encode([
            'ok'       => $ok,
            'message'  => $message,
            'redirect' => $ok ? THANK_YOU : null,
        ]);
        exit;
    }

    if ($ok) {
        header('Location: ' . THANK_YOU, true, 303);
    } else {
        header('Location: contact.html?sent=0', true, 303);
    }
    exit;
}

/** Trim, cap, and strip anything that could forge a mail header. */
function clean(string $key, int $max = 500): string
{
    $value = trim((string) ($_POST[$key] ?? ''));
    $value = str_replace(["\r", "\n", '%0a', '%0d'], ' ', $value);
    return mb_substr($value, 0, $max);
}

/** Append a line to the private error log, best effort. */
function logFailure(array $config, string $context, string $detail): void
{
    $line = sprintf("[%s] %s: %s\n", date('c'), $context, $detail);
    @file_put_contents($config['log'], $line, FILE_APPEND | LOCK_EX);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, 'Method not allowed.', $isAjax);
}

// Bots fill in every field they can see. This one is hidden from people.
if (trim((string) ($_POST['company_website'] ?? '')) !== '') {
    respond(true, 'Thank you.', $isAjax);
}

$name        = clean('name', 120);
$email       = clean('email', 180);
$phone       = clean('phone', 40);
$affiliation = clean('affiliation', 160);
$topic       = clean('topic', 80);
$formId      = clean('form_id', 60);
$message     = mb_substr(trim((string) ($_POST['message'] ?? '')), 0, 4000);

if ($name === '' || $email === '' || $phone === '' || $affiliation === '' || $topic === '' || $message === '') {
    respond(false, 'Please fill in every field and try again.', $isAjax);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(false, 'That email address does not look right. Please check it.', $isAjax);
}

/* ------------------------------------------------------------------ body -- */

$rows = [
    'Name'        => $name,
    'Email'       => $email,
    'Phone'       => $phone,
    'Affiliation' => $affiliation,
    'Topic'       => $topic,
    'Form'        => $formId !== '' ? $formId : 'website',
    'Submitted'   => date('d M Y, H:i'),
    'IP'          => $_SERVER['REMOTE_ADDR'] ?? 'unknown',
];

$body = "GR Global website enquiry\n" . str_repeat('=', 46) . "\n\n";
foreach ($rows as $label => $value) {
    $body .= str_pad($label . ':', 14) . $value . "\n";
}
$body .= "\nMessage:\n" . $message . "\n";

$fromEmail = $config['from_email'];
$fromName  = $config['from_name'];
$subject   = $config['subject'];

$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$encodedFrom    = '=?UTF-8?B?' . base64_encode($fromName) . '?= <' . $fromEmail . '>';

// The visitor's name goes into Reply-To as a display name. Angle brackets,
// quotes or a comma there would malform the address, so they are dropped and
// the rest is encoded the same way the From name is, which also keeps
// non-ASCII names intact.
$replyName = str_replace(['<', '>', '"', ','], ' ', $name);
$encodedReplyTo = '=?UTF-8?B?' . base64_encode(trim($replyName)) . '?= <' . $email . '>';

$headers = [
    'Date: ' . date('r'),
    'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $config['host'] . '>',
    'From: ' . $encodedFrom,
    'To: ' . $config['to'],
    'Reply-To: ' . $encodedReplyTo,
    'Subject: ' . $encodedSubject,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: GR Global site',
];

// Bcc is an envelope recipient only. It must never appear in the headers.
$recipients = array_values(array_filter([$config['to'], $config['bcc']]));

/* ------------------------------------------------------------------ send -- */

$sent = false;

try {
    $smtp = new Smtp($config);
    $smtp->send($fromEmail, $recipients, implode("\r\n", $headers) . "\r\n\r\n" . $body);
    $sent = true;
} catch (Throwable $e) {
    logFailure($config, 'SMTP failed', $e->getMessage());
    if (isset($smtp)) {
        logFailure($config, 'SMTP trace', "\n" . $smtp->trace());
    }

    // Last resort so an enquiry is never simply lost.
    $fallbackHeaders = implode("\r\n", array_filter($headers, static function (string $h): bool {
        return stripos($h, 'To:') !== 0 && stripos($h, 'Subject:') !== 0;
    }));
    $fallbackHeaders .= "\r\nBcc: " . $config['bcc'];

    $sent = @mail($config['to'], $encodedSubject, $body, $fallbackHeaders, '-f' . $fromEmail);

    if (!$sent) {
        logFailure($config, 'mail() fallback failed', 'for ' . $email);
    }
}

if (!$sent) {
    respond(
        false,
        'We could not send that just now. Please email info@grglobal.co.in or call +91 96871 35037.',
        $isAjax
    );
}

respond(true, 'Thank you. Your enquiry has reached us.', $isAjax);
