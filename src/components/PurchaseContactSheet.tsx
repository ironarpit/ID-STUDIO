import React, { useEffect, useMemo, useState } from 'react';
import {
  Phone,
  MessageCircle,
  Copy,
  Check,
  X,
  User,
  AlertTriangle,
  Info,
  ChevronRight,
} from 'lucide-react';
import { Product, PurchaseResponsibilityRecord } from '../types';
import { usePurchaseContact } from '../context/PurchaseContactContext';
import { copyToClipboard } from '../utils/copyUtils';
import { getProductBansalCode } from '../utils/purchaseResponsibility';

interface PurchaseContactButtonProps {
  product: Partial<Product>;
  variant?: 'compact' | 'pill' | 'full';
  className?: string;
}

/**
 * Shared Purchase Contact trigger button used across ProductCard, LastSearchedProductCard,
 * ProductDetailModal, and FloorProductInspectorModal.
 * Stops propagation so tapping it never triggers parent card click handlers.
 */
export const PurchaseContactButton: React.FC<PurchaseContactButtonProps> = ({
  product,
  variant = 'compact',
  className = '',
}) => {
  const { openPurchaseContact, resolveForProduct } = usePurchaseContact();

  const resolution = useMemo(() => resolveForProduct(product), [product, resolveForProduct]);
  const hasAssigned = resolution.status === 'assigned' && resolution.contacts.length > 0;
  const hasConflict = resolution.status === 'ambiguous_code' || (hasAssigned && resolution.contacts.length > 1);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    openPurchaseContact(product);
  };

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={`min-h-[44px] px-3.5 py-2 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98 shadow-2xs whitespace-nowrap shrink-0 ${
          hasAssigned
            ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
            : hasConflict
            ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
            : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
        } ${className}`}
        title="View Purchase Contact"
      >
        <Phone className="w-3.5 h-3.5 shrink-0" />
        <span>Purchase Contact</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md border transition-colors cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap shrink-0 min-h-[28px] ${
        hasAssigned
          ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
          : hasConflict
          ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
          : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
      } ${className}`}
      title="View Purchase Contact"
    >
      <Phone className="w-3 h-3 shrink-0" />
      <span>Purchase Contact</span>
    </button>
  );
};

interface ContactDetailPanelProps {
  contact: PurchaseResponsibilityRecord;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}

const ContactDetailPanel: React.FC<ContactDetailPanelProps> = ({ contact, copiedKey, onCopy }) => {
  const isPhoneCallable =
    (contact.phoneStatus === 'valid_indian' || contact.phoneStatus === 'valid_international') &&
    Boolean(contact.whatsappUrl) &&
    Boolean(contact.telUrl);

  const phoneCopyValue = contact.normalizedPhoneDigits
    ? `+${contact.normalizedPhoneDigits}`
    : contact.rawPhone;

  return (
    <div className="space-y-3">
      {/* Person & Phone Display */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200/80 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Purchase Person
            </div>
            <div className="text-base font-bold text-slate-900 dark:text-white break-words leading-snug">
              {contact.purchasePersonName}
            </div>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Phone Number
            </div>
            <div className="font-mono tabular-nums text-base font-bold text-slate-900 dark:text-white break-all">
              {contact.displayPhone || contact.rawPhone || 'Not provided'}
            </div>
            {contact.displayPhone && contact.rawPhone && contact.displayPhone !== contact.rawPhone && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Raw: {contact.rawPhone}
              </div>
            )}
          </div>
        </div>

        {!isPhoneCallable && (
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold">WhatsApp &amp; Call unavailable</div>
              <div className="text-[11px] leading-relaxed">
                {contact.phoneError || 'Phone number is missing or invalid.'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons: WhatsApp / Call / Copy Number */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {isPhoneCallable ? (
          <a
            href={contact.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-xs whitespace-nowrap"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>WhatsApp</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-not-allowed whitespace-nowrap"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>WhatsApp</span>
          </button>
        )}

        {isPhoneCallable ? (
          <a
            href={contact.telUrl}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors shadow-xs whitespace-nowrap"
          >
            <Phone className="w-4 h-4 shrink-0" />
            <span>Call</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-not-allowed whitespace-nowrap"
          >
            <Phone className="w-4 h-4 shrink-0" />
            <span>Call</span>
          </button>
        )}

        <button
          type="button"
          disabled={!phoneCopyValue}
          onClick={() => phoneCopyValue && onCopy(phoneCopyValue, contact.id)}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {copiedKey === contact.id ? (
            <>
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 shrink-0" />
              <span>Copy Number</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

/**
 * Shared mobile-friendly bottom sheet / desktop dialog for Purchase Contact.
 * Resolves contacts reactively from the currently active Purchase Responsibility Master
 * so replacing or removing the master immediately refreshes an open popup.
 */
export const PurchaseContactModal: React.FC = () => {
  const {
    meta,
    activeTargetProduct,
    isPopupOpen,
    closePurchaseContact,
    resolveForProduct,
  } = usePurchaseContact();

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [selectedAmbiguousCode, setSelectedAmbiguousCode] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const resolution = useMemo(
    () => resolveForProduct(activeTargetProduct),
    [activeTargetProduct, resolveForProduct]
  );

  // Clear stale selections whenever target product or active master changes
  useEffect(() => {
    setSelectedContactId(null);
    setSelectedAmbiguousCode(null);
    setCopiedKey(null);
  }, [activeTargetProduct, meta?.importedAt, meta?.fileName]);

  if (!isPopupOpen || !activeTargetProduct) return null;

  const productName = (activeTargetProduct.name || activeTargetProduct.itemName || 'Selected Product').trim();
  const productCode = getProductBansalCode(activeTargetProduct);

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr));
      }, 2000);
    }
  };

  // Determine active contact to render
  let activeContacts = resolution.contacts;
  if (resolution.status === 'ambiguous_code' && selectedAmbiguousCode && resolution.ambiguousCodeGroups) {
    const group = resolution.ambiguousCodeGroups.find((g) => g.masterCode === selectedAmbiguousCode);
    if (group) {
      activeContacts = group.contacts;
    }
  }

  const activeContact =
    activeContacts.length === 1
      ? activeContacts[0]
      : activeContacts.find((c) => c.id === selectedContactId) || null;

  return (
    <div
      className="fixed inset-0 z-[140] bg-slate-950/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePurchaseContact();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Purchase Contact"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-t sm:border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]"
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1 space-y-0.5">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-tight">
              Purchase Contact
            </h3>
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">
              {productName}
            </p>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              <span>Bansal Code: {productCode || 'Missing'}</span>
              {resolution.matchType === 'leading_zero_normalized' && resolution.matchedMasterCode && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Matched {resolution.matchedMasterCode}</span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={closePurchaseContact}
            className="min-w-[44px] min-h-[44px] -mr-1.5 -mt-1 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
          {/* State 1: No master loaded or no matching code */}
          {(resolution.status === 'no_product_code' || resolution.status === 'not_assigned') && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-center space-y-1.5">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mx-auto">
                <Info className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                Purchase contact not assigned.
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {!meta
                  ? 'No Purchase Responsibility Master is currently uploaded on this device.'
                  : resolution.status === 'no_product_code'
                  ? 'This product does not have a Bansal internal item code.'
                  : `No entry found for Bansal Code ${productCode} in ${meta.fileName}.`}
              </p>
            </div>
          )}

          {/* State 2: Ambiguous leading-zero numeric match across multiple master codes */}
          {resolution.status === 'ambiguous_code' && resolution.ambiguousCodeGroups && (
            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Ambiguous code match</div>
                  <p className="text-[11px] leading-relaxed mt-0.5">
                    Multiple codes in the responsibility master match <span className="font-mono font-bold">{productCode}</span> when leading zeros are ignored. Select the exact master code below:
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                {resolution.ambiguousCodeGroups.map((group) => {
                  const isSelected = selectedAmbiguousCode === group.masterCode;
                  return (
                    <button
                      key={group.masterCode}
                      type="button"
                      onClick={() => {
                        setSelectedAmbiguousCode(group.masterCode);
                        setSelectedContactId(null);
                      }}
                      className={`w-full min-h-[44px] px-3 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-600'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                          Master Code: {group.masterCode}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {group.contacts.map((c) => c.purchasePersonName).join(', ')}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* State 3: Multiple conflicting contacts assigned to the matched code */}
          {activeContacts.length > 1 && (
            <div className="space-y-2">
              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">{activeContacts.length} contacts assigned</span> to this Bansal Code. Choose who to contact:
                </div>
              </div>

              <div className="space-y-1.5">
                {activeContacts.map((c) => {
                  const isSelected = activeContact?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedContactId(c.id)}
                      className={`w-full min-h-[44px] px-3 py-2 rounded-xl border text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 dark:border-indigo-500 ring-1 ring-indigo-500/20'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {c.purchasePersonName}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 truncate">
                          {c.displayPhone || c.rawPhone || 'No phone number'}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                        {isSelected ? 'Selected' : 'Select'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Active Contact Card & Actions */}
          {activeContact && (
            <ContactDetailPanel
              contact={activeContact}
              copiedKey={copiedKey}
              onCopy={handleCopy}
            />
          )}

          {/* Subtle operational note */}
          {activeContact && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              WhatsApp opens the chat window only (requires connectivity). Call opens your device dialler or calling app.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 shrink-0">
          <button
            type="button"
            onClick={closePurchaseContact}
            className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs sm:text-sm transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
