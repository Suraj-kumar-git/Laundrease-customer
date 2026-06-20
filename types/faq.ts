interface FAQItem {
  id: string
  question: string
  answer: string
  category: 'general' | 'orders' | 'pricing' | 'delivery' | 'partners'
  icon: React.ReactNode
}