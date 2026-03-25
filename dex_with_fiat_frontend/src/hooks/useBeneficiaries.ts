'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Beneficiary {
  id: string;
  name: string;
  bankId: number;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  createdAt: number;
}

const STORAGE_KEY = 'stellar_beneficiaries';

function generateId(): string {
  return `ben_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function useBeneficiaries() {
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Beneficiary[];
        setBeneficiaries(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setBeneficiaries([]);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded || typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(beneficiaries));
    } catch {
      // Silently fail if localStorage is unavailable
    }
  }, [beneficiaries, isLoaded]);

  const addBeneficiary = useCallback(
    (
      bankId: number,
      bankName: string,
      bankCode: string,
      accountNumber: string,
      accountName: string,
      customName?: string,
    ): Beneficiary => {
      const newBeneficiary: Beneficiary = {
        id: generateId(),
        name: customName || accountName,
        bankId,
        bankName,
        bankCode,
        accountNumber,
        accountName,
        createdAt: Date.now(),
      };
      setBeneficiaries((prev) => [...prev, newBeneficiary]);
      return newBeneficiary;
    },
    [],
  );

  const renameBeneficiary = useCallback((id: string, newName: string) => {
    setBeneficiaries((prev) =>
      prev.map((b) => (b.id === id ? { ...b, name: newName } : b)),
    );
  }, []);

  const deleteBeneficiary = useCallback((id: string) => {
    setBeneficiaries((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const getBeneficiary = useCallback(
    (id: string): Beneficiary | undefined => {
      return beneficiaries.find((b) => b.id === id);
    },
    [beneficiaries],
  );

  return {
    beneficiaries,
    isLoaded,
    addBeneficiary,
    renameBeneficiary,
    deleteBeneficiary,
    getBeneficiary,
  };
}
