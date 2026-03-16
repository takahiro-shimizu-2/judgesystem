import { useState, useCallback } from 'react';
import type { OrdererCategory } from '../types/orderer';
import { validationRules } from '../constants/formStyles';

export interface OrdererFormData {
  name: string;
  category: OrdererCategory | '';
  address: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  departments: string[];
}

const initialFormData: OrdererFormData = {
  name: '',
  category: '',
  address: '',
  phone: '',
  fax: '',
  email: '',
  website: '',
  departments: [],
};

export function useOrdererForm() {
  const [formData, setFormData] = useState<OrdererFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof OrdererFormData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof OrdererFormData, boolean>>>({});

  const updateField = useCallback(<K extends keyof OrdererFormData>(field: K, value: OrdererFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // フィールド更新時にエラーをクリア
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const setFieldTouched = useCallback((field: keyof OrdererFormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const validateField = useCallback((field: keyof OrdererFormData, value: string | string[]): string | undefined => {
    switch (field) {
      case 'name':
        return validationRules.required(value as string);
      case 'category':
        return validationRules.required(value as string);
      case 'address':
        return validationRules.required(value as string);
      case 'phone':
        return validationRules.required(value as string) || validationRules.phone(value as string);
      case 'email':
        return value ? validationRules.email(value as string) : undefined;
      case 'website':
        return value ? validationRules.url(value as string) : undefined;
      default:
        return undefined;
    }
  }, []);

  const validateAll = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof OrdererFormData, string>> = {};
    let isValid = true;

    (Object.keys(formData) as (keyof OrdererFormData)[]).forEach((field) => {
      const error = validateField(field, formData[field] as string | string[]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    // すべてのフィールドをtouchedにする
    const allTouched = Object.keys(formData).reduce(
      (acc, key) => ({ ...acc, [key]: true }),
      {} as Partial<Record<keyof OrdererFormData, boolean>>
    );
    setTouched(allTouched);

    return isValid;
  }, [formData, validateField]);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setErrors({});
    setTouched({});
  }, []);

  // 部署の追加・削除
  const addDepartment = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      departments: [...prev.departments, ''],
    }));
  }, []);

  const updateDepartment = useCallback((index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      departments: prev.departments.map((d, i) => (i === index ? value : d)),
    }));
  }, []);

  const removeDepartment = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      departments: prev.departments.filter((_, i) => i !== index),
    }));
  }, []);

  return {
    formData,
    errors,
    touched,
    updateField,
    setFieldTouched,
    validateField,
    validateAll,
    resetForm,
    addDepartment,
    updateDepartment,
    removeDepartment,
  };
}
