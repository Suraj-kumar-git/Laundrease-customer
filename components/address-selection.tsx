'use client'
 
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin,
  Plus,
  Edit2,
  Star,
  Tag,
  Phone,
  Home,
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import AddressForm from '@/components/forms/address-form-old'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Address } from '@/types/address'
import { AddressSelectionProps } from '@/types/address-selection-props'
 
export default function AddressSelection({
  userId,
  selectedAddressId,
  onSelect,
  filterByServiceablePostalCode = false,
  title = 'Select Delivery Address',
  description = 'Choose where you want your order delivered',
}: AddressSelectionProps) {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [filteredAddresses, setFilteredAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingAddress, setEditingAddress] = useState<Address | null>(null)
  const [validatingAddresses, setValidatingAddresses] = useState(false)
 
  useEffect(() => {
    fetchAddresses()
  }, [userId])
 
  useEffect(() => {
    if (filterByServiceablePostalCode && addresses.length > 0) {
      validateAddresses()
    } else {
      setFilteredAddresses(addresses)
    }
  }, [addresses, filterByServiceablePostalCode])
 
  const fetchAddresses = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/customer/addresses?userId=${userId}`)
      const result = await response.json()
      
      if (result.success) {
        setAddresses(result.data.addresses)
      }
    } catch (error) {
      console.error('Fetch addresses error:', error)
    } finally {
      setLoading(false)
    }
  }
 
  const validateAddresses = async () => {
    setValidatingAddresses(true)
    try {
      // Validate each address postal code
      const validationPromises = addresses.map(async (address) => {
        const response = await fetch(
          `/api/customer/addresses/validate-postal-code?postalCode=${address.postalCode}`
        )
        const result = await response.json()
        return {
          address,
          isServiceable: result.success && result.data.isServiceable,
        }
      })
      
      const validations = await Promise.all(validationPromises)
      const serviceableAddresses = validations
        .filter(v => v.isServiceable)
        .map(v => v.address)
      
      setFilteredAddresses(serviceableAddresses)
    } catch (error) {
      console.error('Validate addresses error:', error)
      setFilteredAddresses(addresses)
    } finally {
      setValidatingAddresses(false)
    }
  }
 
  const handleAddNew = () => {
    setEditingAddress(null)
    setShowForm(true)
  }
 
  const handleEdit = (address: Address) => {
    setEditingAddress(address)
    setShowForm(true)
  }
 
  const handleFormSuccess = (newAddress: Address) => {
    setShowForm(false)
    setEditingAddress(null)
    fetchAddresses()
    
    // Auto-select the newly created address
    if (!editingAddress) {
      onSelect(newAddress)
    }
  }
 
  const handleFormCancel = () => {
    setShowForm(false)
    setEditingAddress(null)
  }
 
  const handleSelectAddress = (address: Address) => {
    onSelect(address)
  }
 
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    )
  }
 
  const displayAddresses = filteredAddresses.length > 0 ? filteredAddresses : addresses
 
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          {title}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {description}
        </p>
        {filterByServiceablePostalCode && validatingAddresses && (
          <div className="mt-2 flex items-center gap-2 text-sm text-violet-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking service availability...
          </div>
        )}
        {filterByServiceablePostalCode && !validatingAddresses && filteredAddresses.length < addresses.length && (
          <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 dark:text-amber-200">
                <p className="font-semibold">Some addresses not available</p>
                <p>
                  {addresses.length - filteredAddresses.length} of your addresses are not serviceable
                  by laundry providers. Only showing addresses we can deliver to.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
 
      {/* Add New Button */}
      <Button
        onClick={handleAddNew}
        variant="outline"
        className="w-full border-2 border-dashed hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20"
      >
        <Plus className="mr-2 h-5 w-5" />
        Add New Address
      </Button>
 
      {/* Addresses */}
      {displayAddresses.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 mb-4">
            <MapPin className="w-8 h-8 text-violet-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {filterByServiceablePostalCode && addresses.length > 0
              ? 'No Serviceable Addresses'
              : 'No Addresses Saved'}
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {filterByServiceablePostalCode && addresses.length > 0
              ? 'None of your saved addresses are in serviceable areas. Please add an address in a location we serve.'
              : 'Add your first delivery address to continue'}
          </p>
          <Button
            onClick={handleAddNew}
            className="bg-gradient-to-r from-violet-600 to-purple-600"
          >
            <Plus className="mr-2 h-5 w-5" />
            Add Address
          </Button>
        </motion.div>
      ) : (
        <RadioGroup value={selectedAddressId?.toString()} onValueChange={(value) => {
          const address = displayAddresses.find(a => a.id.toString() === value)
          if (address) handleSelectAddress(address)
        }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <AnimatePresence>
              {displayAddresses.map((address, index) => (
                <motion.div
                  key={address.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className={`
                    relative overflow-hidden cursor-pointer transition-all
                    ${selectedAddressId === address.id
                      ? 'border-2 border-violet-500 shadow-lg'
                      : 'border-2 border-transparent hover:border-violet-300'
                    }
                  `}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        {/* Radio Button */}
                        <div className="pt-1">
                          <RadioGroupItem
                            value={address.id.toString()}
                            id={`address-${address.id}`}
                            className="h-5 w-5"
                          />
                        </div>
 
                        {/* Address Content */}
                        <div className="flex-1" onClick={() => handleSelectAddress(address)}>
                          {/* Label & Default Badge */}
                          <div className="flex items-center gap-2 mb-2">
                            {address.label && (
                              <div className="flex items-center gap-1 text-sm font-semibold text-gray-900 dark:text-white">
                                <Home className="h-4 w-4 text-violet-600" />
                                {address.label}
                              </div>
                            )}
                            {address.isDefault && (
                              <Badge className="bg-gradient-to-r from-violet-600 to-purple-600 text-xs">
                                <Star className="h-2 w-2 fill-current mr-1" />
                                Default
                              </Badge>
                            )}
                          </div>
 
                          {/* Address Details */}
                          <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            <p className="font-medium text-gray-900 dark:text-white">
                              {address.addressLine1}
                            </p>
                            {address.addressLine2 && <p>{address.addressLine2}</p>}
                            {address.landmark && <p className="text-xs">Near {address.landmark}</p>}
                            <p className="font-medium">
                              {address.city}, {address.postalCode}
                            </p>
                          </div>
 
                          {/* Contact */}
                          {(address.contactName || address.contactPhone) && (
                            <div className="text-xs text-gray-500 dark:text-gray-500 mb-2">
                              {address.contactName && (
                                <p>
                                  <User className="inline h-3 w-3 mr-1" />
                                  {address.contactName}
                                </p>
                              )}
                              {address.contactPhone && (
                                <p>
                                  <Phone className="inline h-3 w-3 mr-1" />
                                  {address.contactPhone}
                                </p>
                              )}
                            </div>
                          )}
 
                          {/* Tags */}
                          {address.tags && address.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {address.tags.slice(0, 3).map((tag, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                              {address.tags.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{address.tags.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
 
                          {/* Selected Indicator */}
                          {selectedAddressId === address.id && (
                            <div className="flex items-center gap-1 text-violet-600 font-semibold text-sm mt-2">
                              <CheckCircle2 className="h-4 w-4" />
                              Selected
                            </div>
                          )}
                        </div>
 
                        {/* Edit Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEdit(address)
                          }}
                          className="shrink-0"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </RadioGroup>
      )}
 
      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAddress ? 'Edit Address' : 'Add New Address'}
            </DialogTitle>
            <DialogDescription>
              {filterByServiceablePostalCode
                ? 'Only addresses in serviceable areas will be available for delivery'
                : 'Add a new delivery address for your orders'}
            </DialogDescription>
          </DialogHeader>
          <AddressForm
            // userId={userId}
            initialData={editingAddress}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
            requireServiceablePostalCode={filterByServiceablePostalCode}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}