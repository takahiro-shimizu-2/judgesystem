import { useState, useCallback } from 'react';
import { validationRules } from '../constants/formStyles';

export interface StaffFormData {
  name: string;
  department: string;
  email: string;
  phone: string;
}

const initialFormData: StaffFormData = {
  name: '',
  department: '',
  email: '',
  phone: '',
};

export function useStaffForm() {
  const [formData, setFormData] = useState<StaffFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof StaffFormData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof StaffFormData, boolean>>>({});

  const updateField = useCallback(<K extends keyof StaffFormData>(field: K, value: StaffFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // フィールド更新時にエラーをクリア
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }, []);

  const setFieldTouched = useCallback((field: keyof StaffFormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const validateField = useCallback((field: keyof StaffFormData, value: string): string | undefined => {
    switch (field) {
      case 'name':
        return validationRules.required(value);
      case 'department':
        return validationRules.required(value);
      case 'email':
        return validationRules.required(value) || validationRules.email(value);
      case 'phone':
        return validationRules.required(value) || validationRules.phone(value);
      default:
        return undefined;
    }
  }, []);

  const validateAll = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof StaffFormData, string>> = {};
    let isValid = true;

    (Object.keys(formData) as (keyof StaffFormData)[]).forEach((field) => {
      const error = validateField(field, formData[field]);
      if (error) {
        newErrors[field] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    // すべてのフィールドをtouchedにする
    const allTouched = Object.keys(formData).reduce(
      (acc, key) => ({ ...acc, [key]: true }),
      {} as Partial<Record<keyof StaffFormData, boolean>>
    );
    setTouched(allTouched);

    return isValid;
  }, [formData, validateField]);

  const resetForm = useCallback(() => {
    setFormData(initialFormData);
    setErrors({});
    setTouched({});
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
  };
}
