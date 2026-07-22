'use client'
 
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MapPin, Tag, Phone, User as UserIcon, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/components/auth-provider'
import { Address } from '@/types/address'
 
interface AddressFormProps {
  initialData?: Address | null
  onSuccess: (address: Address) => void
  onCancel: () => void
  requireServiceablePostalCode?: boolean // For order creation flow
}
 
interface PostalCodeValidation {
  isServiceable: boolean
  providersCount: number
  message: string
}
 
const commonLabels = ['Home', 'Work', 'Office', 'Shop', 'PG', 'Hostel', 'Parents', 'Other']
const commonTags = ['Front Gate', 'Evening Delivery', 'Call Before', 'No Bell', 'Pet Friendly', 'Security Desk']
 
export default function AddressForm({
  initialData, 
  onSuccess, 
  onCancel,
  requireServiceablePostalCode = false 
}: AddressFormProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [validatingPostalCode, setValidatingPostalCode] = useState(false)
  const [postalCodeValidation, setPostalCodeValidation] = useState<PostalCodeValidation | null>(null)
  
  const [formData, setFormData] = useState<Address>({
    id: initialData?.id || 0,
    label: initialData?.label || '',
    tags: initialData?.tags || [],
    addressLine1: initialData?.addressLine1 || '',
    addressLine2: initialData?.addressLine2 || '',
    landmark: initialData?.landmark || '',
    neighborhood: initialData?.neighborhood || '',
    city: initialData?.city || '',
    state: initialData?.state || '',
    postalCode: initialData?.postalCode || '',
    countryCode: initialData?.countryCode || 'IN',
    instructions: initialData?.instructions || '',
    contactName: initialData?.contactName || '',
    contactPhone: initialData?.contactPhone || '',
    isDefault: initialData?.isDefault || false,
  })
  
  const [customTag, setCustomTag] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
 
  // Validate postal code when it changes (debounced)
  useEffect(() => {
    if (!formData.postalCode || formData.postalCode.length < 4) {
      setPostalCodeValidation(null)
      return
    }
    
    const timer = setTimeout(() => {
      validatePostalCode(formData.postalCode)
    }, 500)
    
    return () => clearTimeout(timer)
  }, [formData.postalCode])
 
  const validatePostalCode = async (postalCode: string) => {
    if (!requireServiceablePostalCode) return
    
    setValidatingPostalCode(true)
    try {
      const response = await fetch(`/api/customer/addresses/validate-postal-code?postalCode=${postalCode}`)
      const result = await response.json()
      
      if (result.success) {
        setPostalCodeValidation({
          isServiceable: result.data.isServiceable,
          providersCount: result.data.providersCount,
          message: result.data.message,
        })
      }
    } catch (error) {
      console.error('Postal code validation error:', error)
    } finally {
      setValidatingPostalCode(false)
    }
  }
 
  const handleInputChange = (field: keyof Address, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }
 
  const toggleTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...(prev.tags || []), tag]
    }))
  }
 
  const addCustomTag = () => {
    if (customTag.trim() && !formData.tags?.includes(customTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...(prev.tags || []), customTag.trim()]
      }))
      setCustomTag('')
    }
  }
 
  const removeTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags?.filter(t => t !== tag) || []
    }))
  }
 
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.addressLine1.trim()) newErrors.addressLine1 = 'Address is required'
    if (!formData.city.trim()) newErrors.city = 'City is required'
    if (!formData.postalCode.trim()) newErrors.postalCode = 'Postal code is required'
    if (formData.contactPhone && !/^\+?[1-9]\d{1,14}$/.test(formData.contactPhone)) {
      newErrors.contactPhone = 'Invalid phone number format'
    }
    
    // Additional validation for order creation flow
    if (requireServiceablePostalCode && postalCodeValidation && !postalCodeValidation.isServiceable) {
      newErrors.postalCode = 'No providers available in this postal code'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }
 
  const handleSubmit = async () => {
    if (!validate()) return
    
    if (!user?.id) {
      alert('Please login to save addresses')
      return
    }
    
    setLoading(true)
    try {
      const endpoint = '/api/customer/addresses/manage'
      const method = initialData?.id ? 'PUT' : 'POST'
      
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Important: send cookies
        body: JSON.stringify({
          ...(initialData?.id && { addressId: initialData.id }),
          ...formData,
        }),
      })
      
      const result = await response.json()
      
      if (result.success) {
        onSuccess(result.data.address)
      } else {
        alert(result.error || 'Failed to save address')
      }
    } catch (error) {
      console.error('Save address error:', error)
      alert('Failed to save address')
    } finally {
      setLoading(false)
    }
  }
 
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Rest of the form JSX remains exactly the same as before */}
      {/* Address Label */}
      <div>
        <Label className="text-sm font-semibold mb-2">Address Label (Optional)</Label>
        <div className="flex flex-wrap gap-2 mb-3">
          {commonLabels.map(label => (
            <Badge
              key={label}
              variant={formData.label === label ? 'default' : 'outline'}
              className="cursor-pointer transition-all hover:scale-105"
              onClick={() => handleInputChange('label', label)}
            >
              {label}
            </Badge>
          ))}
        </div>
        <Input
          placeholder="Or enter custom label"
          value={formData.label}
          onChange={(e) => handleInputChange('label', e.target.value)}
        />
      </div>
 
      {/* Address Line 1 */}
      <div>
        <Label className="text-sm font-semibold">Address Line 1 *</Label>
        <div className="relative mt-2">
          <MapPin className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Flat/House No., Building Name"
            value={formData.addressLine1}
            onChange={(e) => handleInputChange('addressLine1', e.target.value)}
            className={`pl-10 ${errors.addressLine1 ? 'border-red-500' : ''}`}
          />
        </div>
        {errors.addressLine1 && (
          <p className="text-sm text-red-500 mt-1">{errors.addressLine1}</p>
        )}
      </div>
 
      {/* Address Line 2 */}
      <div>
        <Label className="text-sm font-semibold">Address Line 2</Label>
        <Input
          placeholder="Street, Area"
          value={formData.addressLine2}
          onChange={(e) => handleInputChange('addressLine2', e.target.value)}
          className="mt-2"
        />
      </div>
 
      {/* Landmark & Neighborhood */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-semibold">Landmark</Label>
          <Input
            placeholder="Near XYZ"
            value={formData.landmark}
            onChange={(e) => handleInputChange('landmark', e.target.value)}
            className="mt-2"
          />
        </div>
        <div>
          <Label className="text-sm font-semibold">Neighborhood/Locality</Label>
          <Input
            placeholder="Area name"
            value={formData.neighborhood}
            onChange={(e) => handleInputChange('neighborhood', e.target.value)}
            className="mt-2"
          />
        </div>
      </div>
 
      {/* City, State, Postal Code */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label className="text-sm font-semibold">City *</Label>
          <Input
            placeholder="e.g., Pune"
            value={formData.city}
            onChange={(e) => handleInputChange('city', e.target.value)}
            className={`mt-2 ${errors.city ? 'border-red-500' : ''}`}
          />
          {errors.city && (
            <p className="text-sm text-red-500 mt-1">{errors.city}</p>
          )}
        </div>
        <div>
          <Label className="text-sm font-semibold">State</Label>
          <Input
            placeholder="e.g., Maharashtra"
            value={formData.state}
            onChange={(e) => handleInputChange('state', e.target.value)}
            className="mt-2"
          />
        </div>
        <div>
          <Label className="text-sm font-semibold">Postal Code *</Label>
          <div className="relative mt-2">
            <Input
              placeholder="e.g., 411018"
              value={formData.postalCode}
              onChange={(e) => handleInputChange('postalCode', e.target.value)}
              className={`${errors.postalCode ? 'border-red-500' : ''} pr-10`}
            />
            {validatingPostalCode && (
              <Loader2 className="absolute right-3 top-3 h-5 w-5 animate-spin text-muted-foreground" />
            )}
            {!validatingPostalCode && postalCodeValidation && (
              <div className="absolute right-3 top-3">
                {postalCodeValidation.isServiceable ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </div>
            )}
          </div>
          {errors.postalCode && (
            <p className="text-sm text-red-500 mt-1">{errors.postalCode}</p>
          )}
          {postalCodeValidation && (
            <p className={`text-sm mt-1 ${postalCodeValidation.isServiceable ? 'text-green-600' : 'text-red-600'}`}>
              {postalCodeValidation.message}
            </p>
          )}
        </div>
      </div>
 
      {/* Contact Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-semibold">Contact Name</Label>
          <div className="relative mt-2">
            <UserIcon className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Receiver's name"
              value={formData.contactName}
              onChange={(e) => handleInputChange('contactName', e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <div>
          <Label className="text-sm font-semibold">Contact Phone</Label>
          <div className="relative mt-2">
            <Phone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="+91 9876543210"
              value={formData.contactPhone}
              onChange={(e) => handleInputChange('contactPhone', e.target.value)}
              className={`pl-10 ${errors.contactPhone ? 'border-red-500' : ''}`}
            />
          </div>
          {errors.contactPhone && (
            <p className="text-sm text-red-500 mt-1">{errors.contactPhone}</p>
          )}
        </div>
      </div>
 
      {/* Delivery Instructions */}
      <div>
        <Label className="text-sm font-semibold">Delivery Instructions</Label>
        <Textarea
          placeholder="Special instructions for delivery person"
          value={formData.instructions}
          onChange={(e) => handleInputChange('instructions', e.target.value)}
          className="mt-2"
          rows={3}
        />
      </div>
 
      {/* Tags */}
      <div>
        <Label className="text-sm font-semibold mb-2">
          <Tag className="inline h-4 w-4 mr-1" />
          Tags (Optional)
        </Label>
        <div className="flex flex-wrap gap-2 mb-3">
          {commonTags.map(tag => (
            <Badge
              key={tag}
              variant={formData.tags?.includes(tag) ? 'default' : 'outline'}
              className="cursor-pointer transition-all hover:scale-105"
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
        
        {formData.tags && formData.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {formData.tags.filter(t => !commonTags.includes(t)).map(tag => (
              <Badge key={tag} className="cursor-pointer" onClick={() => removeTag(tag)}>
                {tag} ×
              </Badge>
            ))}
          </div>
        )}
        
        <div className="flex gap-2">
          <Input
            placeholder="Add custom tag"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
          />
          <Button type="button" variant="outline" onClick={addCustomTag}>
            Add
          </Button>
        </div>
      </div>
 
      {/* Set as Default */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isDefault"
          checked={formData.isDefault}
          onChange={(e) => handleInputChange('isDefault', e.target.checked)}
          className="rounded border-gray-300"
        />
        <Label htmlFor="isDefault" className="cursor-pointer">
          Set as default address
        </Label>
      </div>
 
      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button
          onClick={handleSubmit}
          disabled={Boolean(
            loading
            || (requireServiceablePostalCode && !(postalCodeValidation?.isServiceable ?? false))
          )}
          className="flex-1 bg-gradient-to-r from-blue-600 to-blue-600 hover:from-blue-700 hover:to-blue-700"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>{initialData?.id ? 'Update' : 'Save'} Address</>
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
    </motion.div>
  )
}
 