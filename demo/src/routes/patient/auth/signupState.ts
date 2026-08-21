import { useCallback, useState } from 'react'

export type SignupStep = 0 | 1 | 2 | 3
export type Gender = '남' | '여'
export type ConsentKey = 'terms' | 'privacy' | 'health' | 'ads'

export type SignupState = {
  step: SignupStep
  consents: Record<ConsentKey, boolean>
  phone: string
  otp: string[]
  password: string
  passwordConfirm: string
  name: string
  birthDate: string
  gender?: Gender
}

export type SignupField =
  | 'phone'
  | 'password'
  | 'passwordConfirm'
  | 'name'
  | 'birthDate'
  | 'gender'

const createInitialState = (): SignupState => ({
  step: 0,
  consents: { terms: false, privacy: false, health: false, ads: false },
  phone: '',
  otp: Array.from({ length: 6 }, () => ''),
  password: '',
  passwordConfirm: '',
  name: '',
  birthDate: '',
  gender: undefined,
})

export const TOTAL_SIGNUP_STEPS = 4

export function useSignupState() {
  const [state, setState] = useState<SignupState>(createInitialState)

  const next = useCallback(() => {
    setState((previous) => ({
      ...previous,
      step: Math.min(previous.step + 1, TOTAL_SIGNUP_STEPS - 1) as SignupStep,
    }))
  }, [])

  const back = useCallback(() => {
    setState((previous) => ({
      ...previous,
      step: Math.max(previous.step - 1, 0) as SignupStep,
    }))
  }, [])

  const setField = useCallback(<K extends SignupField>(field: K, value: SignupState[K]) => {
    setState((previous) => ({ ...previous, [field]: value }))
  }, [])

  const setConsent = useCallback((field: ConsentKey, value: boolean) => {
    setState((previous) => ({
      ...previous,
      consents: { ...previous.consents, [field]: value },
    }))
  }, [])

  const setRequiredConsents = useCallback((value: boolean) => {
    setState((previous) => ({
      ...previous,
      consents: {
        ...previous.consents,
        terms: value,
        privacy: value,
        health: value,
      },
    }))
  }, [])

  const setOtp = useCallback((value: string[]) => {
    setState((previous) => ({ ...previous, otp: value }))
  }, [])

  return { state, next, back, setField, setConsent, setRequiredConsents, setOtp }
}
