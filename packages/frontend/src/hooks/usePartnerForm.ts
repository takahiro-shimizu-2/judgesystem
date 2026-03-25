import { useState, useCallback } from 'react';
import type {
  CompanyBranch,
  UnifiedQualificationItem,
  OrdererQualificationItem,
  OrdererQualification,
} from '../types/partner';
import { validationRules } from '../constants/formStyles';

export interface PartnerFormData {
  // 基本情報
  name: string;
  postalCode: string;
  address: string;
  phone: string;
  email: string;
  fax: string;
  url: string;
  // 会社概要
  representative: string;
  established: string;
  capital: string;
  employeeCount: string;
  // 業種
  categories: string[];
  // 実績・評価
  surveyCount: string;
  resultCount: string;
  rating: number;
  // 拠点
  branches: CompanyBranch[];
  // 資格
  unifiedQualifications: UnifiedQualificationItem[];
  ordererQualifications: OrdererQualification[];
}

const initialFormData: PartnerFormData = {
  name: '',
  postalCode: '',
  address: '',
  phone: '',
  email: '',
  fax: '',
  url: '',
  representative: '',
  established: '',
  capital: '',
  employeeCount: '',
  categories: [],
  surveyCount: '0',
  resultCount: '0',
  rating: 0,
  branches: [],
  unifiedQualifications: [],
  ordererQualifications: [],
};

type SimpleFields = Exclude<
  keyof PartnerFormData,
  'categories' | 'branches' | 'unifiedQualifications' | 'ordererQualifications'
>;

export function usePartnerForm() {
  const [formData, setFormData] = useState<PartnerFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof PartnerFormData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof PartnerFormData, boolean>>>({});

  const updateField = useCallback(<K extends keyof PartnerFormData>(field: K, value: PartnerFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const setFieldTouched = useCallback((field: keyof PartnerFormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const validateField = useCallback((field: keyof PartnerFormData, value: unknown): string | undefined => {
    switch (field) {
      case 'name':
        return validationRules.required(value as string);
      case 'postalCode':
        return validationRules.required(value as string) || validationRules.postalCode(value as string);
      case 'address':
        return validationRules.required(value as string);
      case 'phone':
        return validationRules.required(value as string) || validationRules.phone(value as string);
      case 'email':
        return validationRules.required(value as string) || validationRules.email(value as string);
      case 'url':
        return value ? validationRules.url(value as string) : undefined;
      case 'established':
        return value ? validationRules.year(value as string) : undefined;
      case 'capital':
      case 'employeeCount':
      case 'surveyCount':
      case 'resultCount':
        return value ? validationRules.positiveNumber(value as string) : undefined;
      default:
        return undefined;
    }
  }, []);

  const validateAll = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof PartnerFormData, string>> = {};
    let isValid = true;

    const simpleFields: SimpleFields[] = [
      'name',
      'postalCode',
      'address',
      'phone',
      'email',
      'fax',
      'url',
      'representative',
      'established',
      'capital',
      'employeeCount',
      'surveyCount',
      'resultCount',
      'rating',
    ];

    simpleFields.forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    const allTouched = Object.keys(formData).reduce(
      (acc, key) => ({ ...acc, [key]: true }),
      {} as Partial<Record<keyof PartnerFormData, boolean>>
    );
    setTouched(allTouched);

    return isValid;
  }, [formData, validateField]);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setErrors({});
    setTouched({});
  }, []);

  // 拠点操作
  const addBranch = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      branches: [...prev.branches, { name: '', address: '' }],
    }));
  }, []);

  const updateBranch = useCallback((index: number, field: keyof CompanyBranch, value: string) => {
    setFormData((prev) => ({
      ...prev,
      branches: prev.branches.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    }));
  }, []);

  const removeBranch = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      branches: prev.branches.filter((_, i) => i !== index),
    }));
  }, []);

  // 全省庁統一資格操作
  const addUnifiedQualification = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      unifiedQualifications: [
        ...prev.unifiedQualifications,
        { mainCategory: '', category: '', region: '', value: '', grade: '' },
      ],
    }));
  }, []);

  const updateUnifiedQualification = useCallback(
    (index: number, field: keyof UnifiedQualificationItem, value: string) => {
      setFormData((prev) => ({
        ...prev,
        unifiedQualifications: prev.unifiedQualifications.map((q, i) => (i === index ? { ...q, [field]: value } : q)),
      }));
    },
    []
  );

  const removeUnifiedQualification = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      unifiedQualifications: prev.unifiedQualifications.filter((_, i) => i !== index),
    }));
  }, []);

  // 発注者別資格操作
  const addOrdererQualification = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      ordererQualifications: [
        ...prev.ordererQualifications,
        { ordererName: '', items: [{ category: '', region: '', value: '', grade: '' }] },
      ],
    }));
  }, []);

  const updateOrdererQualificationName = useCallback((index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      ordererQualifications: prev.ordererQualifications.map((q, i) => (i === index ? { ...q, ordererName: value } : q)),
    }));
  }, []);

  const removeOrdererQualification = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      ordererQualifications: prev.ordererQualifications.filter((_, i) => i !== index),
    }));
  }, []);

  const addOrdererQualificationItem = useCallback((ordererIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      ordererQualifications: prev.ordererQualifications.map((q, i) =>
        i === ordererIndex ? { ...q, items: [...q.items, { category: '', region: '', value: '', grade: '' }] } : q
      ),
    }));
  }, []);

  const updateOrdererQualificationItem = useCallback(
    (ordererIndex: number, itemIndex: number, field: keyof OrdererQualificationItem, value: string) => {
      setFormData((prev) => ({
        ...prev,
        ordererQualifications: prev.ordererQualifications.map((q, i) =>
          i === ordererIndex
            ? {
                ...q,
                items: q.items.map((item, j) => (j === itemIndex ? { ...item, [field]: value } : item)),
              }
            : q
        ),
      }));
    },
    []
  );

  const removeOrdererQualificationItem = useCallback((ordererIndex: number, itemIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      ordererQualifications: prev.ordererQualifications.map((q, i) =>
        i === ordererIndex ? { ...q, items: q.items.filter((_, j) => j !== itemIndex) } : q
      ),
    }));
  }, []);

  // 全地域一括追加
  const addOrdererQualificationItemsForAllRegions = useCallback(
    (ordererIndex: number, regions: string[], category: string, defaultValue: string, defaultGrade: string) => {
      setFormData((prev) => ({
        ...prev,
        ordererQualifications: prev.ordererQualifications.map((q, i) =>
          i === ordererIndex
            ? {
                ...q,
                items: [
                  ...q.items,
                  ...regions.map((region) => ({
                    category,
                    region,
                    value: defaultValue,
                    grade: defaultGrade,
                  })),
                ],
              }
            : q
        ),
      }));
    },
    []
  );

  return {
    formData,
    errors,
    touched,
    updateField,
    setFieldTouched,
    validateField,
    validateAll,
    resetForm,
    // 拠点
    addBranch,
    updateBranch,
    removeBranch,
    // 統一資格
    addUnifiedQualification,
    updateUnifiedQualification,
    removeUnifiedQualification,
    // 発注者別資格
    addOrdererQualification,
    updateOrdererQualificationName,
    removeOrdererQualification,
    addOrdererQualificationItem,
    updateOrdererQualificationItem,
    removeOrdererQualificationItem,
    addOrdererQualificationItemsForAllRegions,
  };
}
