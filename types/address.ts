export interface Address {
  id: number
  label?: string
  tags?: string[]
  addressLine1: string
  addressLine2?: string
  landmark?: string
  neighborhood?: string
  city: string
  state?: string
  postalCode: string
  countryCode: string
  instructions?: string
  contactName?: string
  contactPhone?: string
  isDefault: boolean
  position?: {
    lat: number;
    lng: number;
  };
  lastUsedAt?: string
}

export interface AddressSelectionProps {
  userId: string
  selectedAddressId?: number | null
  onSelect: (pickup: Address, delivery?: Address) => void
  filterByServiceablePostalCode?: boolean // Filter addresses by provider availability
  title?: string
  description?: string
}