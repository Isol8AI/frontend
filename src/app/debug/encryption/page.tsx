/**
 * Encryption Verification Dashboard - Development Tool
 *
 * Displays all encryption keys and message encryption details
 * for manual verification using online crypto tools.
 *
 * DEVELOPMENT ONLY - Do not expose in production.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  Key,
  Shield,
  Building2,
  MessageSquare,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';

// Types matching backend response
interface KeyDerivationInfo {
  algorithm: string;
  time_cost: number;
  memory_cost_kb: number;
  parallelism: number;
  output_length: number;
}

interface UserKeyInfo {
  user_id: string;
  public_key_hex: string | null;
  encrypted_private_key_hex: string | null;
  encrypted_private_key_iv_hex: string | null;
  encrypted_private_key_tag_hex: string | null;
  key_salt_hex: string | null;
  key_derivation: KeyDerivationInfo;
  has_encryption_keys: boolean;
  has_recovery_keys: boolean;
}

interface EnclaveKeyInfo {
  transport_public_key_hex: string;
}

interface EncryptionContexts {
  client_to_enclave: string;
  enclave_to_client: string;
  user_message_storage: string;
  assistant_message_storage: string;
  org_key_distribution: string;
}

interface EncryptionAlgorithmInfo {
  cipher: string;
  key_length: number;
  iv_length: number;
  tag_length: number;
}

interface KeyExchangeInfo {
  algorithm: string;
  kdf: string;
  kdf_salt_length: number;
  derived_key_length: number;
}

interface MembershipKeyInfo {
  role: string;
  has_org_key: boolean;
  encrypted_org_key_ephemeral_hex: string | null;
  encrypted_org_key_iv_hex: string | null;
  encrypted_org_key_ciphertext_hex: string | null;
  encrypted_org_key_tag_hex: string | null;
  encrypted_org_key_hkdf_salt_hex: string | null;
}

interface OrgKeyInfo {
  org_id: string;
  org_name: string;
  org_public_key_hex: string | null;
  admin_encrypted_private_key_hex: string | null;
  admin_encrypted_private_key_iv_hex: string | null;
  admin_encrypted_private_key_tag_hex: string | null;
  admin_key_salt_hex: string | null;
  has_encryption_keys: boolean;
  membership: MembershipKeyInfo | null;
}

interface SampleMessageInfo {
  message_id: string;
  session_id: string;
  role: string;
  ephemeral_public_key_hex: string;
  iv_hex: string;
  ciphertext_hex: string;
  ciphertext_length: number;
  auth_tag_hex: string;
  hkdf_salt_hex: string;
  storage_context: string;
}

interface VerificationSteps {
  to_decrypt_user_private_key: string[];
  to_decrypt_message: string[];
  to_decrypt_org_key: string[];
}

interface EncryptionReport {
  user: UserKeyInfo;
  enclave: EnclaveKeyInfo;
  encryption_contexts: EncryptionContexts;
  encryption_algorithm: EncryptionAlgorithmInfo;
  key_exchange: KeyExchangeInfo;
  organizations: OrgKeyInfo[];
  sample_messages: SampleMessageInfo[];
  verification_steps: VerificationSteps;
  online_tools: Record<string, string>;
}

// Copy button component
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 px-2 text-xs"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {label && <span className="ml-1">{label}</span>}
    </Button>
  );
}

// Collapsible section component
function CollapsibleSection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center gap-3 bg-muted/50 hover:bg-muted transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Icon className="h-4 w-4" />
        <span className="font-medium">{title}</span>
      </button>
      {isOpen && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

// Hex value display component
function HexValue({
  label,
  value,
  description,
}: {
  label: string;
  value: string | null;
  description?: string;
}) {
  if (!value) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            {label}
          </span>
        </div>
        <div className="text-sm text-muted-foreground italic">Not set</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
        <CopyButton text={value} />
      </div>
      {description && (
        <div className="text-xs text-muted-foreground">{description}</div>
      )}
      <code className="text-xs font-mono bg-muted p-2 rounded block break-all max-h-24 overflow-y-auto">
        {value}
      </code>
    </div>
  );
}

// Key-value display
function KeyValue({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono">{value}</span>
    </div>
  );
}

export default function DebugEncryptionPage() {
  const api = useApi();
  const [report, setReport] = useState<EncryptionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchReport() {
      try {
        const data = await api.get('/debug/encryption/report');
        setReport(data as EncryptionReport);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setLoading(false);
      }
    }
    fetchReport();
  }, [api]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">{error || 'Failed to load report'}</p>
        <Link href="/">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Chat
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-orange-500" />
            <h1 className="text-lg font-semibold">
              Encryption Verification Dashboard
            </h1>
          </div>
          <div className="ml-auto px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded">
            DEVELOPMENT ONLY
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Warning Banner */}
        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-orange-800 dark:text-orange-200">
                Development Tool
              </h3>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                This page displays sensitive encryption data for verification
                purposes. All values are hex-encoded for easy copy/paste to
                online crypto tools.
              </p>
            </div>
          </div>
        </div>

        {/* User Keys */}
        <CollapsibleSection title="User Encryption Keys" icon={Key} defaultOpen>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">User ID:</span>
              <code className="font-mono bg-muted px-2 py-0.5 rounded">
                {report.user.user_id}
              </code>
              <CopyButton text={report.user.user_id} />
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-1 rounded text-xs ${
                  report.user.has_encryption_keys
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                }`}
              >
                {report.user.has_encryption_keys
                  ? 'Keys Setup'
                  : 'No Keys Setup'}
              </span>
              {report.user.has_recovery_keys && (
                <span className="px-2 py-1 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                  Has Recovery Keys
                </span>
              )}
            </div>

            <HexValue
              label="Public Key (64 hex = 32 bytes)"
              value={report.user.public_key_hex}
              description="X25519 public key - used by enclave to encrypt TO user"
            />

            <HexValue
              label="Encrypted Private Key"
              value={report.user.encrypted_private_key_hex}
              description="AES-256-GCM encrypted with passcode-derived key"
            />

            <div className="grid grid-cols-2 gap-4">
              <HexValue
                label="IV (32 hex = 16 bytes)"
                value={report.user.encrypted_private_key_iv_hex}
              />
              <HexValue
                label="Auth Tag (32 hex = 16 bytes)"
                value={report.user.encrypted_private_key_tag_hex}
              />
            </div>

            <HexValue
              label="Key Salt (64 hex = 32 bytes)"
              value={report.user.key_salt_hex}
              description="Argon2id salt for passcode derivation"
            />

            <div className="p-3 bg-muted/50 rounded-lg">
              <h4 className="text-sm font-medium mb-2">
                Key Derivation Parameters (Argon2id)
              </h4>
              <KeyValue
                label="Algorithm"
                value={report.user.key_derivation.algorithm}
              />
              <KeyValue
                label="Time Cost (iterations)"
                value={report.user.key_derivation.time_cost}
              />
              <KeyValue
                label="Memory Cost"
                value={`${report.user.key_derivation.memory_cost_kb} KB (${report.user.key_derivation.memory_cost_kb / 1024} MB)`}
              />
              <KeyValue
                label="Parallelism"
                value={report.user.key_derivation.parallelism}
              />
              <KeyValue
                label="Output Length"
                value={`${report.user.key_derivation.output_length} bytes`}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* Enclave Keys */}
        <CollapsibleSection
          title="Enclave Transport Key"
          icon={Shield}
          defaultOpen
        >
          <HexValue
            label="Enclave Transport Public Key (64 hex = 32 bytes)"
            value={report.enclave.transport_public_key_hex}
            description="Client encrypts messages TO this key for transport to enclave"
          />
        </CollapsibleSection>

        {/* Encryption Contexts */}
        <CollapsibleSection title="HKDF Contexts" icon={Key}>
          <p className="text-sm text-muted-foreground mb-3">
            These context strings are used in HKDF key derivation. They MUST
            match between encryption and decryption.
          </p>
          <div className="space-y-2">
            {Object.entries(report.encryption_contexts).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between p-2 bg-muted/50 rounded"
              >
                <span className="text-sm">{key.replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono">{value}</code>
                  <CopyButton text={value} />
                </div>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* Algorithm Info */}
        <CollapsibleSection title="Algorithm Details" icon={Shield}>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <h4 className="text-sm font-medium mb-2">
                {report.encryption_algorithm.cipher}
              </h4>
              <KeyValue
                label="Key Length"
                value={`${report.encryption_algorithm.key_length} bytes`}
              />
              <KeyValue
                label="IV Length"
                value={`${report.encryption_algorithm.iv_length} bytes`}
              />
              <KeyValue
                label="Tag Length"
                value={`${report.encryption_algorithm.tag_length} bytes`}
              />
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <h4 className="text-sm font-medium mb-2">
                {report.key_exchange.algorithm}
              </h4>
              <KeyValue label="KDF" value={report.key_exchange.kdf} />
              <KeyValue
                label="Salt Length"
                value={`${report.key_exchange.kdf_salt_length} bytes`}
              />
              <KeyValue
                label="Derived Key Length"
                value={`${report.key_exchange.derived_key_length} bytes`}
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* Organizations */}
        {report.organizations.length > 0 && (
          <CollapsibleSection
            title={`Organizations (${report.organizations.length})`}
            icon={Building2}
          >
            {report.organizations.map((org) => (
              <div
                key={org.org_id}
                className="p-4 border rounded-lg space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    <span className="font-medium">{org.org_name}</span>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">
                      {org.org_id}
                    </code>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs ${
                      org.has_encryption_keys
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}
                  >
                    {org.has_encryption_keys
                      ? 'Org Keys Setup'
                      : 'No Org Keys'}
                  </span>
                </div>

                <HexValue
                  label="Org Public Key"
                  value={org.org_public_key_hex}
                />

                {org.membership && (
                  <div className="p-3 bg-muted/30 rounded-lg space-y-3">
                    <h5 className="text-sm font-medium">Your Membership</h5>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Role:
                      </span>
                      <span className="text-sm font-mono">
                        {org.membership.role}
                      </span>
                      {org.membership.has_org_key && (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          Has Org Key
                        </span>
                      )}
                    </div>
                    {org.membership.has_org_key && (
                      <>
                        <HexValue
                          label="Encrypted Org Key - Ephemeral Public Key"
                          value={org.membership.encrypted_org_key_ephemeral_hex}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <HexValue
                            label="IV"
                            value={org.membership.encrypted_org_key_iv_hex}
                          />
                          <HexValue
                            label="Auth Tag"
                            value={org.membership.encrypted_org_key_tag_hex}
                          />
                        </div>
                        <HexValue
                          label="Ciphertext"
                          value={org.membership.encrypted_org_key_ciphertext_hex}
                        />
                        <HexValue
                          label="HKDF Salt"
                          value={org.membership.encrypted_org_key_hkdf_salt_hex}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CollapsibleSection>
        )}

        {/* Sample Messages */}
        {report.sample_messages.length > 0 && (
          <CollapsibleSection
            title={`Sample Messages (${report.sample_messages.length})`}
            icon={MessageSquare}
          >
            {report.sample_messages.map((msg) => (
              <div
                key={msg.message_id}
                className="p-4 border rounded-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        msg.role === 'assistant'
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                          : 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                      }`}
                    >
                      {msg.role}
                    </span>
                    <code className="text-xs bg-muted px-2 py-0.5 rounded">
                      {msg.message_id.slice(0, 8)}...
                    </code>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>Context:</span>
                    <code>{msg.storage_context}</code>
                    <CopyButton text={msg.storage_context} />
                  </div>
                </div>

                <HexValue
                  label="Ephemeral Public Key"
                  value={msg.ephemeral_public_key_hex}
                />
                <div className="grid grid-cols-2 gap-3">
                  <HexValue label="IV" value={msg.iv_hex} />
                  <HexValue label="Auth Tag" value={msg.auth_tag_hex} />
                </div>
                <HexValue
                  label={`Ciphertext (${msg.ciphertext_length} bytes)`}
                  value={msg.ciphertext_hex}
                />
                <HexValue label="HKDF Salt" value={msg.hkdf_salt_hex} />
              </div>
            ))}
          </CollapsibleSection>
        )}

        {/* Verification Steps */}
        <CollapsibleSection
          title="Verification Steps"
          icon={Check}
          defaultOpen
        >
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-medium mb-2">
                To Decrypt User Private Key:
              </h4>
              <ol className="space-y-1">
                {report.verification_steps.to_decrypt_user_private_key.map(
                  (step, i) => (
                    <li
                      key={i}
                      className="text-sm text-muted-foreground font-mono bg-muted/50 p-2 rounded"
                    >
                      {step}
                    </li>
                  )
                )}
              </ol>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">To Decrypt Message:</h4>
              <ol className="space-y-1">
                {report.verification_steps.to_decrypt_message.map((step, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground font-mono bg-muted/50 p-2 rounded"
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">To Decrypt Org Key:</h4>
              <ol className="space-y-1">
                {report.verification_steps.to_decrypt_org_key.map((step, i) => (
                  <li
                    key={i}
                    className="text-sm text-muted-foreground font-mono bg-muted/50 p-2 rounded"
                  >
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </CollapsibleSection>

        {/* Online Tools */}
        <CollapsibleSection title="Online Verification Tools" icon={ExternalLink}>
          <div className="space-y-2">
            {Object.entries(report.online_tools).map(([name, url]) => (
              <a
                key={name}
                href={url.split(' ')[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-muted/50 rounded hover:bg-muted transition-colors"
              >
                <span className="text-sm font-medium capitalize">
                  {name.replace(/_/g, ' ')}
                </span>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="truncate max-w-md">{url}</span>
                  <ExternalLink className="h-4 w-4" />
                </div>
              </a>
            ))}
          </div>
        </CollapsibleSection>
      </div>
    </div>
  );
}
