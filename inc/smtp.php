<?php
/**
 * A small authenticated SMTP sender.
 *
 * Enough to deliver one plain-text message over an authenticated connection,
 * without pulling in a mail library. Throws RuntimeException with the server's
 * own reply whenever a step is refused, so failures are diagnosable.
 */

declare(strict_types=1);

final class Smtp
{
    /** @var resource|null */
    private $socket = null;
    private array $cfg;
    private array $trace = [];

    /** True once the greeting has been read and EHLO accepted. */
    private bool $greeted = false;

    public function __construct(array $cfg)
    {
        $this->cfg = $cfg;
    }

    /**
     * @param string   $from       Envelope sender.
     * @param string[] $recipients Every address that should receive it, Bcc included.
     * @param string   $data       Full message: headers, blank line, body.
     */
    public function send(string $from, array $recipients, string $data): void
    {
        $this->connect();

        try {
            // On implicit TLS the greeting is still waiting; a STARTTLS upgrade
            // has already read it and re-sent EHLO.
            if (!$this->greeted) {
                $this->expect(220);
                $this->command('EHLO ' . $this->clientHostname(), 250);
                $this->greeted = true;
            }

            $this->command('AUTH LOGIN', 334);
            $this->command(base64_encode($this->cfg['username']), 334);
            $this->command(base64_encode($this->cfg['password']), 235);

            $this->command('MAIL FROM:<' . $from . '>', 250);

            foreach ($recipients as $rcpt) {
                // 251 means the server will forward it on. Both are a yes.
                $this->command('RCPT TO:<' . $rcpt . '>', [250, 251]);
            }

            $this->command('DATA', 354);
            $this->write($this->prepareBody($data) . "\r\n.\r\n");
            $this->expect(250);

            $this->command('QUIT', [221, 250]);
        } finally {
            $this->close();
        }
    }

    /** The conversation so far, for the error log. */
    public function trace(): string
    {
        return implode("\n", $this->trace);
    }

    private function connect(): void
    {
        $secure = strtolower((string) ($this->cfg['secure'] ?? 'ssl'));
        $prefix = $secure === 'ssl' ? 'ssl://' : 'tcp://';
        $target = $prefix . $this->cfg['host'] . ':' . (int) $this->cfg['port'];

        $verify  = (bool) ($this->cfg['verify_cert'] ?? true);
        $context = stream_context_create([
            'ssl' => [
                'verify_peer'       => $verify,
                'verify_peer_name'  => $verify,
                'allow_self_signed' => !$verify,
                'SNI_enabled'       => true,
            ],
        ]);

        $errno = 0;
        $error = '';
        $socket = @stream_socket_client(
            $target,
            $errno,
            $error,
            (float) ($this->cfg['timeout'] ?? 20),
            STREAM_CLIENT_CONNECT,
            $context
        );

        if ($socket === false) {
            throw new RuntimeException(sprintf('Cannot reach %s (%d %s)', $target, $errno, $error));
        }

        stream_set_timeout($socket, (int) ($this->cfg['timeout'] ?? 20));
        $this->socket = $socket;

        // Port 587 starts in the clear and is upgraded after EHLO.
        if ($secure === 'tls') {
            $this->expect(220);
            $this->command('EHLO ' . $this->clientHostname(), 250);
            $this->command('STARTTLS', 220);

            $ok = @stream_socket_enable_crypto(
                $this->socket,
                true,
                STREAM_CRYPTO_METHOD_TLS_CLIENT
            );

            if ($ok !== true) {
                throw new RuntimeException('STARTTLS negotiation failed');
            }

            // Re-greet on the encrypted channel, then let send() carry on.
            $this->trace[] = '(tls established)';
            $this->command('EHLO ' . $this->clientHostname(), 250);
            $this->greeted = true;
        }
    }

    private function close(): void
    {
        if (is_resource($this->socket)) {
            @fclose($this->socket);
        }
        $this->socket = null;
    }

    private function clientHostname(): string
    {
        $host = $_SERVER['SERVER_NAME'] ?? gethostname();
        if (!is_string($host) || $host === '' || !preg_match('/^[A-Za-z0-9.\-]+$/', $host)) {
            $host = 'localhost';
        }
        return $host;
    }

    private function write(string $line): void
    {
        if (@fwrite($this->socket, $line) === false) {
            throw new RuntimeException('Lost the connection while writing');
        }
    }

    /** @param int|int[] $expected */
    private function command(string $line, $expected): string
    {
        $this->trace[] = '> ' . (stripos($line, 'AUTH') === 0 ? $line : $this->redact($line));
        $this->write($line . "\r\n");
        return $this->expect($expected);
    }

    /** Never let the base64 credentials reach the log. */
    private function redact(string $line): string
    {
        return preg_match('/^[A-Za-z0-9+\/=]{12,}$/', $line) ? '<credential>' : $line;
    }

    /** @param int|int[] $expected */
    private function expect($expected): string
    {
        $codes = (array) $expected;
        $reply = '';

        while (true) {
            $line = @fgets($this->socket, 1024);

            if ($line === false || $line === '') {
                $meta = is_resource($this->socket) ? stream_get_meta_data($this->socket) : [];
                $why  = !empty($meta['timed_out']) ? 'timed out' : 'connection closed';
                throw new RuntimeException('No reply from the mail server (' . $why . ')');
            }

            $reply .= $line;

            // A multi-line reply keeps a hyphen after the code: "250-SIZE".
            if (strlen($line) >= 4 && $line[3] === ' ') {
                break;
            }
        }

        $this->trace[] = '< ' . trim($reply);
        $code = (int) substr($reply, 0, 3);

        if (!in_array($code, $codes, true)) {
            throw new RuntimeException('Server said: ' . trim($reply));
        }

        return $reply;
    }

    /** Normalise line endings and escape any line that begins with a dot. */
    private function prepareBody(string $data): string
    {
        $data = str_replace(["\r\n", "\r"], "\n", $data);
        $lines = explode("\n", $data);

        foreach ($lines as $i => $line) {
            if (isset($line[0]) && $line[0] === '.') {
                $lines[$i] = '.' . $line;
            }
        }

        return implode("\r\n", $lines);
    }
}
