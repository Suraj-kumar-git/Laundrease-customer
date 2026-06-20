'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Droplets,
  Wind,
  Shirt,
  Home,
  Star,
  Clock,
  MapPin,
  Search,
  Award,
  ShieldCheck,
  Loader2,
  TrendingUp,
  Heart,
  Zap,
  CheckCircle2,
} from 'lucide-react'

interface Service {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  startingPrice: number
  popular?: boolean
  features: string[]
}

interface LaundryProvider {
  id: number
  business_name: string
  business_address: string
  service_area: string
  operating_hours: any
  certifications: string[]
  services_offered: string[]
  rating: number
}

const services: Service[] = [
  {
    id: '1',
    name: 'Wash & Fold',
    description: 'Standard washing and folding service for everyday clothes',
    icon: <Droplets className="w-8 h-8" />,
    startingPrice: 40,
    popular: true,
    features: ['Eco-friendly detergent', 'Soft fabric care', 'Neat folding', '48-hour turnaround'],
  },
  {
    id: '2',
    name: 'Dry Cleaning',
    description: 'Professional dry cleaning for delicate fabrics and formal wear',
    icon: <Wind className="w-8 h-8" />,
    startingPrice: 150,
    popular: true,
    features: ['Gentle on fabrics', 'No water damage', 'Professional finish', 'Suits & dresses'],
  },
  {
    id: '3',
    name: 'Steam Ironing',
    description: 'Crisp ironing with steam for wrinkle-free clothes',
    icon: <Zap className="w-8 h-8" />,
    startingPrice: 30,
    features: ['Wrinkle removal', 'Professional press', 'Quick service', 'All fabric types'],
  },
  {
    id: '4',
    name: 'Stain Removal',
    description: 'Expert stain removal for tough spots and marks',
    icon: <Sparkles className="w-8 h-8" />,
    startingPrice: 50,
    features: ['Oil stains', 'Food stains', 'Ink removal', 'Safe chemicals'],
  },
  {
    id: '5',
    name: 'Party Wear Care',
    description: 'Special care for expensive party wear and designer clothes',
    icon: <Heart className="w-8 h-8" />,
    startingPrice: 200,
    popular: true,
    features: ['Delicate handling', 'Hand wash option', 'Premium care', 'Designer fabric safe'],
  },
  {
    id: '6',
    name: 'Kids Clothing',
    description: 'Gentle washing for children\'s clothes with hypoallergenic products',
    icon: <Shirt className="w-8 h-8" />,
    startingPrice: 35,
    features: ['Hypoallergenic', 'Soft detergent', 'Safe for kids', 'Stain focused'],
  },
  {
    id: '7',
    name: 'Bedding & Curtains',
    description: 'Deep cleaning for bedsheets, blankets, curtains, and table covers',
    icon: <Home className="w-8 h-8" />,
    startingPrice: 60,
    features: ['Deep cleaning', 'Dust removal', 'Fresh scent', 'Large items'],
  },
  {
    id: '8',
    name: 'Express Service',
    description: 'Same-day delivery for urgent laundry needs',
    icon: <TrendingUp className="w-8 h-8" />,
    startingPrice: 80,
    features: ['12-hour delivery', 'Priority handling', 'Same-day service', 'Express care'],
  },
]

export default function ServicesPage() {
  const [searchLocation, setSearchLocation] = useState('')
  const [providers, setProviders] = useState<LaundryProvider[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [selectedService, setSelectedService] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!searchLocation.trim()) return

    setLoading(true)
    setSearched(true)

    try {
      // Call API to fetch laundry providers
      const response = await fetch(
        `/api/customer/laundry-providers/search?location=${encodeURIComponent(searchLocation)}`
      )
      
      if (response.ok) {
        const result = await response.json()
        console.log('Fetched providers:', result.providers);
        const providersData = result.data?.providers || result.providers as LaundryProvider[]
        setProviders(providersData || [])
      } else {
        console.error('Failed to fetch providers:', response.statusText)
        setProviders([])
      }
    } catch (error) {
      console.error('Error fetching providers:', error)
      setProviders([])
    } finally {
      setLoading(false)
    }
  }

  const getOperatingHoursText = (hours: any) => {
    if (!hours || typeof hours !== 'object') return 'Hours not available'
    
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()
    const todayHours = hours[today]
    
    if (!todayHours) return 'Hours not available'
    if (todayHours === 'closed') return 'Closed today'
    
    return `${todayHours.open} - ${todayHours.close}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-purple-50 dark:from-gray-950 dark:via-gray-900 dark:to-violet-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-r from-violet-600 to-purple-600 py-20">
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="container mx-auto px-4 relative z-10"
        >
          <div className="text-center mb-12">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm mb-6"
            >
              <Sparkles className="w-10 h-10 text-white" />
            </motion.div>
            
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
              Our Premium Services
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto mb-8">
              Professional laundry care for all your clothing needs. From everyday wear to special garments, we've got you covered.
            </p>

            {/* Location Search */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-2 shadow-2xl">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Enter your pincode or area (e.g., 411018, Pimpri)"
                      value={searchLocation}
                      onChange={(e) => setSearchLocation(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-transparent focus:border-violet-500 focus:outline-none bg-gray-50 dark:bg-gray-700 dark:text-white transition-all"
                    />
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSearch}
                    disabled={loading}
                    className="px-8 py-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Search className="w-5 h-5" />
                    )}
                    {loading ? 'Searching...' : 'Search'}
                  </motion.button>
                </div>
              </div>
              
              <p className="text-white/80 text-sm mt-4">
                * Services and pricing may vary based on laundry providers in your area
              </p>
            </motion.div>
          </div>
        </motion.div>

        {/* Decorative elements */}
        <div className="absolute top-10 left-10 w-20 h-20 bg-white/10 rounded-full blur-xl animate-float" />
        <div className="absolute bottom-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-xl animate-float" style={{ animationDelay: '1s' }} />
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Providers Section */}
        {searched && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="text-center mb-6">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Available Laundry Providers
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                {providers.length > 0 
                  ? `Found ${providers.length} providers in your area`
                  : 'No providers found in your area'}
              </p>
            </div>
      
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-12 h-12 animate-spin text-violet-600" />
              </div>
            ) : providers.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {providers.map((provider, index) => (
                  <motion.div
                    key={provider.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-2xl hover:border-violet-500 transition-all"
                  >
                    {/* Provider Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                          {provider.business_name}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                          <MapPin className="w-4 h-4" />
                          <span>{provider.business_address}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 bg-gradient-to-r from-violet-600 to-purple-600 text-white px-3 py-1 rounded-full">
                        <Star className="w-4 h-4 fill-current" />
                        <span className="font-semibold">{provider.rating.toFixed(1)}</span>
                      </div>
                    </div>
      
                    {/* Service Area */}
                    <div className="mb-4 p-3 bg-violet-50 dark:bg-gray-700 rounded-lg">
                      <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Service Area</div>
                      <div className="font-semibold text-gray-900 dark:text-white">
                        {provider.service_area}
                      </div>
                    </div>
      
                    {/* Operating Hours */}
                    <div className="mb-4 flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Clock className="w-5 h-5" />
                      <span className="font-medium">{getOperatingHoursText(provider.operating_hours)}</span>
                    </div>
      
                    {/* Certifications */}
                    {provider.certifications && provider.certifications.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Award className="w-5 h-5 text-violet-600" />
                          <span className="font-semibold text-gray-900 dark:text-white">Certifications</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {provider.certifications.map((cert, i) => (
                            <span
                              key={i}
                              className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm rounded-full flex items-center gap-1"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              {cert}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
      
                    {/* Services Offered */}
                    {provider.services_offered && provider.services_offered.length > 0 && (
                      <div>
                        <div className="font-semibold text-gray-900 dark:text-white mb-2">
                          Services Offered
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {provider.services_offered.map((service, i) => (
                            <span
                              key={i}
                              className="px-3 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-sm rounded-full"
                            >
                              {service}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
      
                    {/* Book Button */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full mt-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                    >
                      Book Now
                    </motion.button>
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl shadow-lg"
              >
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 mb-6">
                  <MapPin className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                  No providers found
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                  We don't have laundry providers in this area yet. We're expanding soon!
                </p>
                <button
                  onClick={() => {
                    setSearchLocation('')
                    setSearched(false)
                    setProviders([])
                  }}
                  className="px-6 py-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                >
                  Search Another Area
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
        {/* Services Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-16"
        >
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4 pt-10 pb-5">
              What We Offer
            </h2>
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              Comprehensive laundry solutions tailored to your needs
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map((service, index) => (
              <motion.div
                key={service.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -8 }}
                onClick={() => setSelectedService(selectedService === service.id ? null : service.id)}
                className="relative bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all cursor-pointer border-2 border-transparent hover:border-violet-500"
              >
                {service.popular && (
                  <div className="absolute -top-3 -right-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
                    Popular
                  </div>
                )}

                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white mb-4">
                  {service.icon}
                </div>

                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  {service.name}
                </h3>
                
                <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                  {service.description}
                </p>

                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-bold text-gradient">₹{service.startingPrice}</span>
                  <span className="text-gray-500 dark:text-gray-400 text-sm">onwards</span>
                </div>

                <AnimatePresence>
                  {selectedService === service.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4"
                    >
                      <ul className="space-y-2">
                        {service.features.map((feature, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </motion.div>


        {/* Why Choose Us Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="mt-20"
        >
          <div className="bg-gradient-to-br from-violet-600 to-purple-600 rounded-3xl p-8 md:p-12 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
            
            <div className="relative z-10">
              <h2 className="text-3xl font-bold mb-8 text-center">Why Choose Laundrease?</h2>
              
              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Quality Assured</h3>
                  <p className="text-white/80">All providers are verified and certified for quality service</p>
                </div>

                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
                    <Clock className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">On-Time Delivery</h3>
                  <p className="text-white/80">Track your order and get timely updates every step of the way</p>
                </div>

                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4">
                    <Heart className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Care for Your Clothes</h3>
                  <p className="text-white/80">Premium care using eco-friendly products and gentle processes</p>
                </div>
              </div>
            </div>

            {/* Decorative circles */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          </div>
        </motion.div>
      </div>
    </div>
  )
}
