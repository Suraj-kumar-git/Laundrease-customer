// lib/validation/india.ts
// Shared India-specific format validation used by auth/onboarding forms (client)
// and their API routes (server). Keep both sides in sync by importing from here.

// ─── Mobile numbers ───────────────────────────────────────────────────────────
// Accepts: 9876543210 | +919876543210 | 919876543210 | 09876543210
// Returns the bare 10-digit number, or null if invalid.
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/[^\d]/g, '')
  let ten = digits
  if (digits.length === 12 && digits.startsWith('91')) ten = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) ten = digits.slice(1)
  if (!/^[6-9]\d{9}$/.test(ten)) return null
  return ten
}

export function isValidIndianMobile(input: string): boolean {
  return normalizeIndianMobile(input) !== null
}

// Accepts "+91 98765 43210", "919876543210", "09876543210", or a bare 10-digit
// number → keeps just the bare 10 digits, which is all a phone field ever
// stores while the user is still typing (format is enforced on submit via
// isValidIndianMobile, not here — this only caps what's typeable).
export function toTenDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(2, 12)
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  return digits.slice(0, 10)
}

// ─── Vehicle registration number ──────────────────────────────────────────────
// Standard: MH12AB1234 (state + RTO + series + 4 digits, series optional on old plates)
// Bharat series: 22BH1234AB
export const VEHICLE_NUMBER_REGEX = /^([A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}|[0-9]{2}BH[0-9]{4}[A-Z]{1,2})$/

export function isValidVehicleNumber(input: string): boolean {
  return VEHICLE_NUMBER_REGEX.test(input.toUpperCase().replace(/[\s-]/g, ''))
}

// ─── Driving license ──────────────────────────────────────────────────────────
// Format: SS RR YYYY NNNNNNN → 2 state letters + 2-digit RTO + 4-digit year + 7-digit serial
export const LICENSE_NUMBER_REGEX = /^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7}$/

export function isValidLicenseNumber(input: string): boolean {
  return LICENSE_NUMBER_REGEX.test(input.toUpperCase().replace(/[\s-]/g, ''))
}

// ─── PIN code ────────────────────────────────────────────────────────────────
export const PINCODE_REGEX = /^[1-9][0-9]{5}$/
export function isValidPincode(input: string): boolean {
  return PINCODE_REGEX.test(input.trim())
}

// ─── IFSC ────────────────────────────────────────────────────────────────────
export const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/
export function isValidIfsc(input: string): boolean {
  return IFSC_REGEX.test(input.toUpperCase().trim())
}

// ─── PAN ─────────────────────────────────────────────────────────────────────
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
export function isValidPan(input: string): boolean {
  return PAN_REGEX.test(input.toUpperCase().trim())
}

// ─── Bank account number ─────────────────────────────────────────────────────
export function isValidBankAccountNumber(input: string): boolean {
  return /^\d{9,18}$/.test(input.replace(/\s/g, ''))
}

// ─── Person name ─────────────────────────────────────────────────────────────
// Letters, spaces, dots, apostrophes, hyphens; 2–60 chars
export const PERSON_NAME_REGEX = /^[A-Za-z][A-Za-z\s.'-]{1,59}$/
export function isValidPersonName(input: string): boolean {
  return PERSON_NAME_REGEX.test(input.trim())
}

// ─── Email ───────────────────────────────────────────────────────────────────
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(input: string): boolean {
  return EMAIL_REGEX.test(input.trim())
}

// ─── Vehicle models by type (popular in India; 'Other' allows free text) ─────
export const VEHICLE_MODELS: Record<string, string[]> = {
  bike: [
    'Hero Splendor Plus', 'Hero HF Deluxe', 'Hero Passion Pro',
    'Honda Shine', 'Honda SP 125', 'Honda Unicorn',
    'Bajaj Pulsar 125', 'Bajaj Pulsar 150', 'Bajaj Platina',
    'TVS Raider', 'TVS Apache RTR 160', 'TVS Star City Plus',
    'Royal Enfield Classic 350', 'Yamaha FZ-S', 'Other',
  ],
  scooter: [
    'Honda Activa 6G', 'Honda Activa 125', 'Honda Dio',
    'TVS Jupiter', 'TVS Ntorq 125', 'TVS XL100',
    'Suzuki Access 125', 'Suzuki Burgman Street',
    'Hero Pleasure Plus', 'Hero Destini 125',
    'Yamaha Fascino 125', 'Yamaha RayZR',
    'Ola S1', 'Ather 450X', 'Bajaj Chetak', 'Other',
  ],
  moped: [
    'TVS XL100 Heavy Duty', 'TVS XL100 Comfort', 'Hero Puch', 'Other',
  ],
  'auto-rickshaw': [
    'Bajaj RE Compact', 'Bajaj Maxima C', 'Piaggio Ape City',
    'Piaggio Ape Xtra', 'Mahindra Alfa', 'Atul Rik', 'TVS King', 'Other',
  ],
  car: [
    'Maruti Alto', 'Maruti Wagon R', 'Maruti Swift', 'Maruti Dzire', 'Maruti Eeco',
    'Hyundai i10', 'Hyundai i20', 'Tata Tiago', 'Tata Punch', 'Tata Nexon',
    'Renault Kwid', 'Kia Sonet', 'Other',
  ],
  van: [
    'Maruti Eeco Cargo', 'Maruti Omni', 'Tata Ace', 'Tata Magic',
    'Mahindra Supro', 'Mahindra Jeeto', 'Ashok Leyland Dost', 'Other',
  ],
}
