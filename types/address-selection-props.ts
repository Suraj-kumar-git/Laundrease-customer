import { Address } from "./address"

export interface AddressSelectionProps {
  userId: string
  selectedAddressId?: number | null
  onSelect: (pickup: Address, delivery?: Address) => void
  filterByServiceablePostalCode?: boolean // Filter addresses by provider availability
  title?: string
  description?: string
}