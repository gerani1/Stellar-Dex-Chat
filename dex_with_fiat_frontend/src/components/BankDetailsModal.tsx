'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Search,
  Building2,
  Trash2,
  Edit2,
  Save,
  UserPlus,
  Star,
} from 'lucide-react';
import { convertCryptoToFiat } from '@/lib/cryptoPriceService';
import { useNotifications } from '@/hooks/useNotifications';
import { useBeneficiaries, Beneficiary } from '@/hooks/useBeneficiaries';

interface Bank {
  id: number;
  name: string;
  code: string;
  active: boolean;
  country: string;
  currency: string;
  type: string;
}

interface VerifyAccountData {
  account_name: string;
}

interface CreateRecipientData {
  recipient_code: string;
  [key: string]: unknown;
}

interface InitiateTransferData {
  reference: string;
  transfer_code: string;
  status: string;
  [key: string]: unknown;
}

export interface BankDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  xlmAmount: number;
}

type Step = 1 | 2 | 3 | 4;

export default function BankDetailsModal({
  isOpen,
  onClose,
  xlmAmount,
}: BankDetailsModalProps) {
  const {
    beneficiaries,
    isLoaded: beneficiariesLoaded,
    addBeneficiary,
    renameBeneficiary,
    deleteBeneficiary,
  } = useBeneficiaries();

  const { addNotification } = useNotifications();

  const [step, setStep] = useState<Step>(1);

  // Saved beneficiary selection
  const [showSavedBeneficiaries, setShowSavedBeneficiaries] = useState(false);
  const [selectedSavedBeneficiary, setSelectedSavedBeneficiary] = useState<Beneficiary | null>(null);
  const [editingBeneficiaryId, setEditingBeneficiaryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [saveCustomName, setSaveCustomName] = useState('');

  // Step 1 — bank selection
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksError, setBanksError] = useState('');
  const [bankSearch, setBankSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);

  // Step 2 — account details
  const [accountNumber, setAccountNumber] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [verifiedAccount, setVerifiedAccount] =
    useState<VerifyAccountData | null>(null);

  // Step 3 — confirm payout
  const [ngnAmount, setNgnAmount] = useState<number | null>(null);
  const [ngnLoading, setNgnLoading] = useState(false);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState('');

  // Step 4 — success
  const [transferReference, setTransferReference] = useState('');

  // Fetch banks when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setBanksLoading(true);
    setBanksError('');
    fetch('/api/banks')
      .then((r) => r.json())
      .then((json: { success: boolean; data: Bank[]; message?: string }) => {
        if (json.success) {
          setBanks(json.data);
        } else {
          setBanksError(json.message ?? 'Failed to load banks');
        }
      })
      .catch(() => setBanksError('Failed to load banks. Please try again.'))
      .finally(() => setBanksLoading(false));
  }, [isOpen]);

  // Fetch NGN estimate when the user reaches step 3
  useEffect(() => {
    if (step !== 3 || xlmAmount <= 0) return;
    setNgnLoading(true);
    convertCryptoToFiat('XLM', xlmAmount, 'ngn')
      .then(setNgnAmount)
      .catch(() => setNgnAmount(null))
      .finally(() => setNgnLoading(false));
  }, [step, xlmAmount]);

  const filteredBanks = banks.filter((b) =>
    b.name.toLowerCase().includes(bankSearch.toLowerCase()),
  );

  const handleVerifyAccount = useCallback(async () => {
    if (!accountNumber || !selectedBank) return;
    setVerifying(true);
    setVerifyError('');
    setVerifiedAccount(null);
    try {
      const res = await fetch('/api/verify-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountNumber,
          bankCode: selectedBank.code,
        }),
      });
      const json: {
        success: boolean;
        data: VerifyAccountData;
        message?: string;
      } = await res.json();
      if (json.success) {
        setVerifiedAccount(json.data);
      } else {
        setVerifyError(json.message ?? 'Account verification failed');
      }
    } catch {
      setVerifyError('Account verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  }, [accountNumber, selectedBank]);

  const handleConfirmPayout = async () => {
    if (!selectedBank || !verifiedAccount) return;
    setPayoutLoading(true);
    setPayoutError('');
    addNotification('payout_pending', 'Fiat payout request is pending...');
    try {
      // 1. Create Paystack transfer recipient
      const recipientRes = await fetch('/api/create-recipient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'nuban',
          name: verifiedAccount.account_name,
          account_number: accountNumber,
          bank_code: selectedBank.code,
          currency: 'NGN',
        }),
      });
      const recipientJson: {
        success: boolean;
        data: CreateRecipientData;
        message?: string;
      } = await recipientRes.json();
      if (!recipientJson.success) {
        throw new Error(
          recipientJson.message ?? 'Failed to create transfer recipient',
        );
      }

      // 2. Initiate the NGN bank transfer
      // The route handler multiplies the amount by 100 before calling Paystack,
      // so we send the NGN value directly (not kobo).
      const ngnValue = ngnAmount ?? xlmAmount * 1000;
      const transferRes = await fetch('/api/initiate-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'balance',
          reason: `XLM to NGN — ${xlmAmount} XLM`,
          amount: ngnValue,
          recipient: recipientJson.data.recipient_code,
        }),
      });
      const transferJson: {
        success: boolean;
        data: InitiateTransferData;
        message?: string;
      } = await transferRes.json();
      if (!transferJson.success) {
        throw new Error(
          transferJson.message ?? 'Failed to initiate bank transfer',
        );
      }

      setTransferReference(
        transferJson.data.reference || transferJson.data.transfer_code || '',
      );
      // Simulation block
      await new Promise(resolve => setTimeout(resolve, 2500));
      setStep(4);
      addNotification('payout_success', 'Fiat payout successfully completed!');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Payout failed. Please try again.';
      setPayoutError(errorMsg);
      addNotification('payout_fail', `Payout failed: ${errorMsg}`);
    } finally {
      setPayoutLoading(false);
    }
  };

  const handleClose = () => {
    // Reset all state before closing
    setStep(1);
    setBanks([]);
    setBanksLoading(false);
    setBanksError('');
    setBankSearch('');
    setSelectedBank(null);
    setAccountNumber('');
    setVerifying(false);
    setVerifyError('');
    setVerifiedAccount(null);
    setNgnAmount(null);
    setNgnLoading(false);
    setPayoutLoading(false);
    setPayoutError('');
    setTransferReference('');
    setShowSavedBeneficiaries(false);
    setSelectedSavedBeneficiary(null);
    setEditingBeneficiaryId(null);
    setEditingName('');
    setShowSavePrompt(false);
    setSaveCustomName('');
    onClose();
  };

  const handleSelectSavedBeneficiary = (beneficiary: Beneficiary) => {
    setSelectedSavedBeneficiary(beneficiary);
    const bank = banks.find((b) => b.id === beneficiary.bankId);
    if (bank) {
      setSelectedBank(bank);
    }
    setAccountNumber(beneficiary.accountNumber);
    setVerifiedAccount({ account_name: beneficiary.accountName });
    setShowSavedBeneficiaries(false);
    setStep(3);
  };

  const handleStartRename = (beneficiary: Beneficiary) => {
    setEditingBeneficiaryId(beneficiary.id);
    setEditingName(beneficiary.name);
  };

  const handleSaveRename = (id: string) => {
    if (editingName.trim()) {
      renameBeneficiary(id, editingName.trim());
    }
    setEditingBeneficiaryId(null);
    setEditingName('');
  };

  const handleDeleteBeneficiary = (id: string) => {
    deleteBeneficiary(id);
    if (selectedSavedBeneficiary?.id === id) {
      setSelectedSavedBeneficiary(null);
    }
  };

  const handleSaveBeneficiary = () => {
    if (!selectedBank || !verifiedAccount) return;
    addBeneficiary(
      selectedBank.id,
      selectedBank.name,
      selectedBank.code,
      accountNumber,
      verifiedAccount.account_name,
      saveCustomName || undefined,
    );
    setShowSavePrompt(false);
    setSaveCustomName('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Fiat Payout</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators — hidden on the success screen */}
        {step < 4 && (
          <div className="flex items-center gap-1 mb-6">
            {([1, 2, 3] as const).map((s) => (
              <React.Fragment key={s}>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    step === s
                      ? 'bg-blue-600 text-white'
                      : step > s
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div
                    className={`flex-1 h-0.5 ${step > s ? 'bg-green-500' : 'bg-gray-700'}`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

    {/* ── Step 1: Bank Selection ── */}
    {step === 1 && (
      <div>
        {/* Saved Beneficiaries Toggle */}
        {beneficiariesLoaded && beneficiaries.length > 0 && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowSavedBeneficiaries(!showSavedBeneficiaries)}
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              <Star className="w-4 h-4" />
              Use saved beneficiary ({beneficiaries.length})
              <ChevronRight className={`w-3 h-3 transition-transform ${showSavedBeneficiaries ? 'rotate-90' : ''}`} />
            </button>

            {showSavedBeneficiaries && (
              <div className="mt-2 max-h-40 overflow-y-auto space-y-1 pr-1">
                {beneficiaries.map((beneficiary) => (
                  <div
                    key={beneficiary.id}
                    className="flex items-center gap-2 bg-gray-800 rounded-lg p-2"
                  >
                    {editingBeneficiaryId === beneficiary.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1 bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(beneficiary.id)}
                          className="p-1 text-green-400 hover:text-green-300"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingBeneficiaryId(null)}
                          className="p-1 text-gray-400 hover:text-gray-300"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSelectSavedBeneficiary(beneficiary)}
                          className="flex-1 text-left"
                        >
                          <p className="text-white text-sm font-medium">
                            {beneficiary.name}
                          </p>
                          <p className="text-gray-400 text-xs">
                            {beneficiary.bankName} · {beneficiary.accountNumber}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartRename(beneficiary)}
                          className="p-1 text-gray-400 hover:text-gray-300"
                          title="Rename"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBeneficiary(beneficiary.id)}
                          className="p-1 text-gray-400 hover:text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-sm text-gray-400 mb-4">Select your bank</p>

        {banksLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : banksError ? (
          <div className="flex items-center gap-2 text-red-400 text-sm py-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{banksError}</span>
              </div>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={bankSearch}
                    onChange={(e) => setBankSearch(e.target.value)}
                    placeholder="Search banks…"
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-9 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                  />
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1 pr-1">
                  {filteredBanks.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-4">
                      No banks found
                    </p>
                  ) : (
                    filteredBanks.map((bank) => (
                      <button
                        key={bank.id}
                        type="button"
                        onClick={() => setSelectedBank(bank)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedBank?.id === bank.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                        }`}
                      >
                        {bank.name}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!selectedBank}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-lg font-medium transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Step 2: Account Details ── */}
        {step === 2 && (
          <div>
            <p className="text-sm text-gray-400 mb-1">
              Bank:{' '}
              <span className="text-white font-medium">
                {selectedBank?.name}
              </span>
            </p>
            <p className="text-sm text-gray-400 mb-4">
              Enter your account number
            </p>

            <div className="mb-3">
              <label className="block text-sm text-gray-400 mb-1">
                Account Number
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => {
                  setAccountNumber(e.target.value);
                  setVerifiedAccount(null);
                  setVerifyError('');
                }}
                onBlur={handleVerifyAccount}
                maxLength={10}
                placeholder="0000000000"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {verifying && (
              <div className="flex items-center gap-2 text-blue-400 text-sm mb-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying account…</span>
              </div>
            )}

            {verifyError && !verifying && (
              <div className="flex items-center gap-2 text-red-400 text-sm mb-3 bg-red-400/10 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{verifyError}</span>
              </div>
            )}

        {verifiedAccount && !verifying && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-400 text-sm mb-3 bg-green-400/10 rounded-lg px-3 py-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                Account name:{' '}
                <strong>{verifiedAccount.account_name}</strong>
              </span>
            </div>

            {/* Save beneficiary prompt */}
            {!showSavePrompt && (
              <button
                type="button"
                onClick={() => setShowSavePrompt(true)}
                className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Save beneficiary for future use
              </button>
            )}

            {showSavePrompt && (
              <div className="bg-gray-800 rounded-lg p-3 space-y-2">
                <label className="block text-xs text-gray-400">
                  Beneficiary name (optional)
                </label>
                <input
                  type="text"
                  value={saveCustomName}
                  onChange={(e) => setSaveCustomName(e.target.value)}
                  placeholder={verifiedAccount.account_name}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveBeneficiary}
                    className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSavePrompt(false);
                      setSaveCustomName('');
                    }}
                    className="px-3 py-2 text-gray-400 hover:text-white text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 mt-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!verifiedAccount}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white py-3 rounded-lg font-medium transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm Payout ── */}
        {step === 3 && (
          <div>
            <p className="text-sm text-gray-400 mb-4">
              Review your payout details
            </p>

            <div className="bg-gray-800 rounded-xl p-4 space-y-3 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">XLM deposited</span>
                <span className="text-white font-medium">
                  {xlmAmount} XLM
                </span>
              </div>

              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-400">Estimated NGN</span>
                {ngnLoading ? (
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                ) : ngnAmount !== null ? (
                  <span className="text-white font-medium">
                    ₦
                    {ngnAmount.toLocaleString('en-NG', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                ) : (
                  <span className="text-gray-500">—</span>
                )}
              </div>

              <div className="border-t border-gray-700 pt-3 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Bank</span>
                  <span className="text-white font-medium">
                    {selectedBank?.name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Account name</span>
                  <span className="text-white font-medium">
                    {verifiedAccount?.account_name}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Account number</span>
                  <span className="text-white font-medium font-mono">
                    {accountNumber}
                  </span>
                </div>
              </div>
            </div>

            {payoutError && (
              <div className="flex items-center gap-2 text-red-400 text-sm mb-4 bg-red-400/10 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{payoutError}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={payoutLoading}
                className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmPayout}
                disabled={payoutLoading}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:opacity-70 text-white py-3 rounded-lg font-medium transition-colors"
              >
                {payoutLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  'Confirm Payout'
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Success ── */}
        {step === 4 && (
          <div className="text-center py-4">
            <CheckCircle className="w-14 h-14 text-green-400 mx-auto mb-4" />
            <p className="text-white font-semibold text-lg mb-2">
              Payout Initiated!
            </p>
            <p className="text-gray-400 text-sm mb-6">
              Your bank transfer is processing. This usually takes a few
              minutes.
            </p>

            {transferReference && (
              <div className="bg-gray-800 rounded-lg px-4 py-3 mb-6 text-left">
                <p className="text-xs text-gray-500 mb-1">
                  Transfer Reference
                </p>
                <p className="text-white font-mono text-sm break-all">
                  {transferReference}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
