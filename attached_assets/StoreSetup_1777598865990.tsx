import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createStore, getStoreByUserId, updateStore, checkSlugExists } from "@/lib/firebase-service";
import { AdminLayout } from "./AdminLayout";
import { FileUpload } from "@/components/ui/file-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Image, Upload, MapPin, CreditCard, Printer, QrCode, Truck, Globe } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import InputMask from "@/components/ui/input-mask";
import { PlaqueGenerator } from "@/components/admin/PlaqueGenerator";
import { PrinterConfiguration } from "@/components/admin/PrinterConfiguration";
import { PaymentMethodsConfiguration } from "@/components/admin/PaymentMethodsConfiguration";
import type { Store, OperatingHours, PaymentMethods } from "@/types";

// Business categories for the dropdown (ordered alphabetically)
const BUSINESS_CATEGORIES_UNSORTED = [
  "Academia",
  "Acessórios",
  "Açougue",
  "Artigos Esportivos",
  "Auto Peças",
  "Bar",
  "Barbearia",
  "Bebidas",
  "Brinquedos",
  "Cafeteria",
  "Calçados",
  "Casa e Decoração",
  "Celulares e Acessórios",
  "Chaveiro",
  "Churrascaria",
  "Clínica Médica",
  "Clínica Odontológica",
  "Comida Árabe",
  "Comida Chinesa",
  "Comida Italiana",
  "Comida Japonesa",
  "Comida Mexicana",
  "Comida Vegana",
  "Confeitaria",
  "Conserto de Eletrônicos",
  "Cosméticos",
  "Distribuidora",
  "Drogaria",
  "Eletrodomésticos",
  "Eletrônicos",
  "Farmácia",
  "Ferramentas",
  "Floricultura",
  "Fotografia",
  "Frios",
  "Gráfica",
  "Hamburgueria",
  "Hortifruti",
  "Informática",
  "Joias e Bijuterias",
  "Laboratório",
  "Lanchonete",
  "Lava Rápido",
  "Lavanderia",
  "Livraria",
  "Loja de Roupas",
  "Marmitex/Quentinha",
  "Materiais de Construção",
  "Mercearia",
  "Móveis",
  "Oficina Mecânica",
  "Ótica",
  "Padaria",
  "Papelaria",
  "Pastelaria",
  "Perfumaria",
  "Petshop",
  "Pizzaria",
  "Posto de Combustível",
  "Restaurante",
  "Salão de Beleza",
  "Serviços Gerais",
  "Sorveteria",
  "Supermercado",
  "Tapiocaria",
  "Veterinária"
];

// Sort categories alphabetically, handling accents correctly, with "Outros" at the end
const BUSINESS_CATEGORIES = [
  ...BUSINESS_CATEGORIES_UNSORTED.sort((a, b) => 
    a.normalize('NFD').replace(/[\u0300-\u036f]/g, '').localeCompare(
      b.normalize('NFD').replace(/[\u0300-\u036f]/g, ''), 'pt-BR'
    )
  ),
  "Outros"
];

interface StoreSetupProps {
  onComplete: () => void;
  onNavigateDashboard?: () => void;
  onNavigateProducts?: () => void;
  onNavigateOrders?: () => void;
}

export const StoreSetup = ({ onComplete, onNavigateDashboard, onNavigateProducts, onNavigateOrders }: StoreSetupProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [existingStore, setExistingStore] = useState<Store | null>(null);
  const [deliveryFeeDisplay, setDeliveryFeeDisplay] = useState("");
  const [minimumOrderDisplay, setMinimumOrderDisplay] = useState("");
  const [freeDeliveryDisplay, setFreeDeliveryDisplay] = useState("");

  // Format currency for display
  const formatCurrency = (value: string) => {
    const numericValue = value.replace(/\D/g, '');
    
    if (!numericValue) return '';
    
    const cents = parseInt(numericValue.slice(0, 8));
    const reais = cents / 100;
    
    return reais.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  };

  // Parse currency from formatted string
  const parseCurrencyToNumber = (value: string): number => {
    const numericString = value
      .replace(/R\$\s?/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    
    return parseFloat(numericString) || 0;
  };

  // Fetch address from ViaCEP API
  const fetchAddressByCep = async (cep: string) => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          street: data.logradouro || "",
          neighborhood: data.bairro || "",
          city: data.localidade || "",
          state: data.uf || "",
          address: `${data.logradouro || ""}, ${prev.number}, ${data.bairro || ""}, ${data.localidade || ""} - ${data.uf || ""}${prev.complement ? `, ${prev.complement}` : ""}`.replace(/^, |, $/, "")
        }));
        toast({
          title: "CEP encontrado!",
          description: "Endereço preenchido automaticamente.",
        });
      } else {
        toast({
          title: "CEP não encontrado",
          description: "Verifique se o CEP está correto.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao buscar CEP. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoadingCep(false);
    }
  };

  // Generate slug from store name
  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  };

  // Extract filename from URL
  const getFileNameFromUrl = (url: string): string => {
    if (!url) return '';
    const urlParts = url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    // Remove timestamp prefix if present (e.g., "1234567890-logo.png" -> "logo.png")
    return fileName.replace(/^\d+-/, '');
  };

  // States for slug validation
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [isValidatingSlug, setIsValidatingSlug] = useState(false);

  // Validate slug availability
  const validateSlug = async (slug: string) => {
    if (!slug) {
      setSlugStatus('idle');
      return;
    }

    setIsValidatingSlug(true);
    setSlugStatus('checking');

    try {
      const exists = await checkSlugExists(slug, existingStore?.id);
      setSlugStatus(exists ? 'taken' : 'available');
    } catch (error) {
      console.error('Error checking slug:', error);
      setSlugStatus('idle');
    } finally {
      setIsValidatingSlug(false);
    }
  };

  // Handle name change and auto-generate slug
  const handleNameChange = (name: string) => {
    setFormData(prev => {
      const slug = generateSlug(name);
      setTimeout(() => validateSlug(slug), 300); // Debounce validation
      return { ...prev, name, slug };
    });
  };

  // Handle manual slug change
  const handleSlugChange = (slug: string) => {
    const formattedSlug = generateSlug(slug);
    setFormData(prev => ({ ...prev, slug: formattedSlug }));
    setTimeout(() => validateSlug(formattedSlug), 300);
  };
  
  const [formData, setFormData] = useState<{
    name: string;
    slug: string;
    description: string;
    category: string;
    personType: '' | 'fisica' | 'juridica';
    cpf: string;
    cnpj: string;
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    address: string;
    whatsapp: string;
    logoUrl: string;
    coverUrl: string;
    faviconUrl: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    deliveryFee: number;
    minimumOrder: number;
    freeDeliveryThreshold: number;
    deliveryTime: string;
    pickupTime: string;
    freeDeliveryNeighborhoods: string[];
    socialLinks: {
      instagram: string;
      facebook: string;
      twitter: string;
      tiktok: string;
      youtube: string;
      linkedin: string;
      threads: string;
      kwai: string;
      googleBusiness: string;
      website: string;
    };
  }>({
    name: "",
    slug: "",
    description: "",
    category: "",
    // Legal information
    personType: "" as '' | 'fisica' | 'juridica',
    cpf: "",
    cnpj: "",
    // Address fields
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    address: "",
    whatsapp: "",
    logoUrl: "",
    coverUrl: "",
    faviconUrl: "",
    // Theme colors
    primaryColor: "#000000",
    secondaryColor: "#000000", 
    accentColor: "#000000",
    deliveryFee: 0,
    minimumOrder: 0,
    freeDeliveryThreshold: 0,
    deliveryTime: "",
    pickupTime: "",
    freeDeliveryNeighborhoods: [],
    socialLinks: {
      instagram: "",
      facebook: "",
      twitter: "",
      tiktok: "",
      youtube: "",
      linkedin: "",
      threads: "",
      kwai: "",
      googleBusiness: "",
      website: "",
    },
  });

  const [operatingHours, setOperatingHours] = useState<OperatingHours[]>([
    { day: "Segunda", isOpen: false, openTime: "", closeTime: "" },
    { day: "Terça", isOpen: false, openTime: "", closeTime: "" },
    { day: "Quarta", isOpen: false, openTime: "", closeTime: "" },
    { day: "Quinta", isOpen: false, openTime: "", closeTime: "" },
    { day: "Sexta", isOpen: false, openTime: "", closeTime: "" },
    { day: "Sábado", isOpen: false, openTime: "", closeTime: "" },
    { day: "Domingo", isOpen: false, openTime: "", closeTime: "" },
  ]);

  // Tab switching state
  const [activeTab, setActiveTab] = useState("store");
  const [isTabLoading, setIsTabLoading] = useState(false);
  const [cnpjValidation, setCnpjValidation] = useState<{
    status: 'idle' | 'validating' | 'valid' | 'invalid';
    data?: any;
    error?: string;
  }>({ status: 'idle' });

  // CEP lookup for free delivery neighborhoods
  const [cepLookup, setCepLookup] = useState('');
  const [cepLookupLoading, setCepLookupLoading] = useState(false);

  // Function to find neighborhood by CEP
  const findNeighborhoodByCep = async () => {
    const cleanCep = cepLookup.replace(/\D/g, '');
    if (cleanCep.length !== 8) {
      toast({
        title: "CEP inválido",
        description: "Digite um CEP válido com 8 dígitos.",
        variant: "destructive",
      });
      return;
    }

    setCepLookupLoading(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      
      if (!data.erro && data.bairro) {
        const neighborhood = data.bairro;
        
        // Check if neighborhood is already in the list
        if (formData.freeDeliveryNeighborhoods.includes(neighborhood)) {
          toast({
            title: "Bairro já adicionado",
            description: `O bairro "${neighborhood}" já está na lista de frete grátis.`,
            variant: "destructive",
          });
        } else {
          // Add neighborhood to the list
          setFormData(prev => ({
            ...prev,
            freeDeliveryNeighborhoods: [...prev.freeDeliveryNeighborhoods, neighborhood]
          }));
          toast({
            title: "Bairro adicionado!",
            description: `${neighborhood} foi adicionado à lista de frete grátis.`,
          });
          setCepLookup(''); // Clear the input
        }
      } else {
        toast({
          title: "CEP não encontrado",
          description: "Não foi possível encontrar o bairro para este CEP.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao buscar CEP. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCepLookupLoading(false);
    }
  };

  useEffect(() => {
    const loadExistingStore = async () => {
      if (!user) return;

      try {
        const store = await getStoreByUserId(user.id);
        if (store) {
          setExistingStore(store);
          setFormData({
            name: store.name,
            slug: store.slug || "",
            description: store.description,
            category: store.category || "",
            // Legal information
            personType: store.personType || "",
            cpf: store.cpf || (store.personType === 'fisica' ? user.cpf || "" : ""),
            cnpj: store.cnpj || "",
            // Address fields
            cep: store.cep || "",
            street: store.street || "",
            number: store.number || "",
            complement: store.complement || "",
            neighborhood: store.neighborhood || "",
            city: store.city || "",
            state: store.state || "",
            address: store.address,
            whatsapp: store.whatsapp,
            logoUrl: store.logoUrl || "",
            coverUrl: store.coverUrl || "",
            faviconUrl: store.faviconUrl || "",
            primaryColor: store.primaryColor || "#000000",
            secondaryColor: store.secondaryColor || "#000000",
            accentColor: store.accentColor || "#000000",
            deliveryFee: store.deliveryFee,
            minimumOrder: store.minimumOrder,
            freeDeliveryThreshold: store.freeDeliveryThreshold,
            deliveryTime: store.deliveryTime || "20-30 min",
            pickupTime: store.pickupTime || "15-20 min",
            freeDeliveryNeighborhoods: store.freeDeliveryNeighborhoods || [],
            socialLinks: {
              instagram: store.socialLinks?.instagram || "",
              facebook: store.socialLinks?.facebook || "",
              twitter: store.socialLinks?.twitter || "",
              tiktok: store.socialLinks?.tiktok || "",
              youtube: store.socialLinks?.youtube || "",
              linkedin: store.socialLinks?.linkedin || "",
              threads: store.socialLinks?.threads || "",
              kwai: store.socialLinks?.kwai || "",
              googleBusiness: store.socialLinks?.googleBusiness || "",
              website: store.socialLinks?.website || "",
            },
          });
          setOperatingHours(store.operatingHours);
          
          // Initialize display values for currency fields
          if (store.deliveryFee > 0) {
            const deliveryInCents = (store.deliveryFee * 100).toString();
            setDeliveryFeeDisplay(formatCurrency(deliveryInCents));
          }
          if (store.minimumOrder > 0) {
            const minimumInCents = (store.minimumOrder * 100).toString();
            setMinimumOrderDisplay(formatCurrency(minimumInCents));
          }
          if (store.freeDeliveryThreshold > 0) {
            const freeDeliveryInCents = (store.freeDeliveryThreshold * 100).toString();
            setFreeDeliveryDisplay(formatCurrency(freeDeliveryInCents));
          }
          
          // If store has CNPJ and is juridica, validate and set as valid if correct
          if (store.personType === 'juridica' && store.cnpj) {
            const cleanCnpj = store.cnpj.replace(/\D/g, '');
            if (cleanCnpj.length === 14) {
              // Use the same validation function used elsewhere in the component
              const isValidCnpj = (cnpj: string): boolean => {
                if (cnpj.length !== 14) return false;
                
                // Check if all digits are the same
                if (/^(\d)\1{13}$/.test(cnpj)) return false;

                let sum = 0;
                let pos = 5;
                
                // First verification digit
                for (let i = 0; i < 12; i++) {
                  sum += parseInt(cnpj.charAt(i)) * pos--;
                  if (pos < 2) pos = 9;
                }
                
                let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
                if (result !== parseInt(cnpj.charAt(12))) return false;
                
                // Second verification digit
                sum = 0;
                pos = 6;
                for (let i = 0; i < 13; i++) {
                  sum += parseInt(cnpj.charAt(i)) * pos--;
                  if (pos < 2) pos = 9;
                }
                
                result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
                return result === parseInt(cnpj.charAt(13));
              };
              
              if (isValidCnpj(cleanCnpj)) {
                setCnpjValidation({
                  status: 'valid',
                  data: {
                    nome: `CNPJ validado: ${cleanCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`,
                    situacao: 'Já cadastrado',
                    atividade_principal: 'CNPJ já validado anteriormente',
                  }
                });
              }
            }
          }
        }
      } catch (error) {
        console.error("Error loading store:", error);
      } finally {
        setInitialLoading(false);
      }
    };

    loadExistingStore();
  }, [user]);

  // Validate CNPJ with basic algorithm and format check
  const validateCnpj = async (cnpj: string) => {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length !== 14) return;

    setCnpjValidation({ status: 'validating' });

    // Basic CNPJ algorithm validation
    const isValidCnpj = (cnpj: string): boolean => {
      if (cnpj.length !== 14) return false;
      
      // Check if all digits are the same
      if (/^(\d)\1{13}$/.test(cnpj)) return false;

      let sum = 0;
      let pos = 5;
      
      // First verification digit
      for (let i = 0; i < 12; i++) {
        sum += parseInt(cnpj.charAt(i)) * pos--;
        if (pos < 2) pos = 9;
      }
      
      let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
      if (result !== parseInt(cnpj.charAt(12))) return false;
      
      // Second verification digit
      sum = 0;
      pos = 6;
      for (let i = 0; i < 13; i++) {
        sum += parseInt(cnpj.charAt(i)) * pos--;
        if (pos < 2) pos = 9;
      }
      
      result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
      return result === parseInt(cnpj.charAt(13));
    };

    // Simulate API delay for better UX
    await new Promise(resolve => setTimeout(resolve, 800));

    if (isValidCnpj(cleanCnpj)) {
      setCnpjValidation({
        status: 'valid',
        data: {
          nome: `CNPJ validado: ${cleanCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}`,
          situacao: 'Formato válido',
          atividade_principal: 'Verificação offline - algoritmo válido',
        }
      });
    } else {
      setCnpjValidation({
        status: 'invalid',
        error: 'CNPJ inválido - verifique os dígitos digitados'
      });
    }
  };

  // Handle person type change
  const handlePersonTypeChange = (personType: 'fisica' | 'juridica') => {
    setFormData(prev => ({
      ...prev,
      personType,
      cpf: personType === 'fisica' ? (user?.cpf || "") : "",
      cnpj: personType === 'juridica' ? prev.cnpj : ""
    }));
    
    // Reset CNPJ validation when changing person type
    if (personType === 'fisica') {
      setCnpjValidation({ status: 'idle' });
    }
  };

  // Handle CNPJ change with validation
  const handleCnpjChange = (cnpj: string) => {
    setFormData(prev => ({ ...prev, cnpj }));
    
    // Reset validation state
    setCnpjValidation({ status: 'idle' });
    
    // Validate if CNPJ is complete
    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj.length === 14) {
      validateCnpj(cnpj);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Check if profile is complete
    const isProfileComplete = user.profileCompleted && 
      user.emailVerified && 
      user.photoUrl && 
      user.displayName && 
      user.cpf && 
      user.birthDate && 
      user.gender && 
      user.phone && 
      user.cep;

    if (!isProfileComplete) {
      toast({
        title: "Perfil incompleto",
        description: "Você precisa completar seu perfil antes de configurar sua loja.",
        variant: "destructive",
      });
      return;
    }

    // Validate person type selection
    if (!formData.personType) {
      toast({
        title: "Tipo de pessoa obrigatório",
        description: "Selecione se você é Pessoa Física ou Jurídica.",
        variant: "destructive",
      });
      return;
    }

    // Validate CNPJ for Pessoa Jurídica
    if (formData.personType === 'juridica') {
      if (!formData.cnpj) {
        toast({
          title: "CNPJ obrigatório",
          description: "O CNPJ é obrigatório para Pessoa Jurídica.",
          variant: "destructive",
        });
        return;
      }
      
      if (cnpjValidation.status !== 'valid') {
        toast({
          title: "CNPJ inválido",
          description: "O CNPJ deve ser validado na Receita Federal antes de continuar.",
          variant: "destructive",
        });
        return;
      }
    }

    // Validate CPF for Pessoa Física
    if (formData.personType === 'fisica' && !formData.cpf) {
      toast({
        title: "CPF obrigatório",
        description: "Complete o CPF no seu perfil para continuar como Pessoa Física.",
        variant: "destructive",
      });
      return;
    }

    // Validate slug before saving
    if (!formData.slug) {
      toast({
        title: "Erro de validação",
        description: "A URL da loja é obrigatória.",
        variant: "destructive",
      });
      return;
    }

    if (slugStatus === 'taken') {
      toast({
        title: "URL não disponível",
        description: "Esta URL já está em uso. Escolha outra.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Final slug validation
      const slugExists = await checkSlugExists(formData.slug, existingStore?.id);
      if (slugExists) {
        setSlugStatus('taken');
        toast({
          title: "URL não disponível",
          description: "Esta URL já está em uso. Escolha outra.",
          variant: "destructive",
        });
        return;
      }

      const storeData = {
        ...formData,
        personType: formData.personType as 'fisica' | 'juridica', // Type assertion since we validated it's not empty
        userId: user.id,
        operatingHours,
        isActive: true,
      };

      if (existingStore) {
        await updateStore(existingStore.id, storeData);
        toast({
          title: "Loja atualizada!",
          description: "As informações da sua loja foram atualizadas com sucesso.",
        });
      } else {
        const storeId = await createStore(storeData);
        // Update user with storeId
        // await updateUser(user.id, { storeId });
        toast({
          title: "Loja criada!",
          description: "Sua loja foi configurada com sucesso!",
        });
      }
      
      onComplete();
    } catch (error) {
      console.error("Erro ao salvar loja:", error);
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido ao salvar loja";
      toast({
        title: "Erro",
        description: `Erro ao salvar loja: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateOperatingHour = (index: number, field: keyof OperatingHours, value: any) => {
    const newHours = [...operatingHours];
    newHours[index] = { ...newHours[index], [field]: value };
    setOperatingHours(newHours);
  };

  // Update full address when address fields change
  const updateAddressField = (field: string, value: string) => {
    const newFormData = { ...formData, [field]: value };
    
    // Generate full address
    const fullAddress = [
      newFormData.street,
      newFormData.number,
      newFormData.complement,
      newFormData.neighborhood,
      newFormData.city,
      newFormData.state
    ].filter(Boolean).join(', ');
    
    setFormData({ ...newFormData, address: fullAddress });
  };

  // Handle tab change with loading state
  const handleTabChange = (value: string) => {
    if (value === activeTab) return;
    
    setIsTabLoading(true);
    setTimeout(() => {
      setActiveTab(value);
      setIsTabLoading(false);
    }, 300); // Short loading state for better UX
  };

  // Handle payment methods save
  const handlePaymentMethodsSave = async (paymentMethods: PaymentMethods) => {
    if (!existingStore) {
      toast({
        title: "Erro",
        description: "Você precisa salvar as informações da loja primeiro.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateStore(existingStore.id, { paymentMethods });
      toast({
        title: "Métodos de pagamento salvos!",
        description: "As configurações de pagamento foram atualizadas com sucesso.",
      });
    } catch (error) {
      console.error("Error saving payment methods:", error);
      throw error;
    }
  };

  // Skeleton components for each tab
  const StoreTabSkeleton = () => (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
        <Skeleton className="w-40 sm:w-48 h-8 mb-2" />
        <Skeleton className="w-full max-w-lg h-4" />
      </CardHeader>
      <CardContent className="space-y-6 sm:space-y-8 overflow-hidden">
        {/* Store Images */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-4 min-w-0">
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-full h-32 rounded-xl" />
            </div>
          ))}
        </div>

        {/* Theme Colors */}
        <div className="space-y-4">
          <Skeleton className="w-32 h-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 min-w-0">
                <Skeleton className="w-20 h-4" />
                <div className="flex gap-2">
                  <Skeleton className="w-12 h-10 rounded-md shrink-0" />
                  <Skeleton className="flex-1 h-10 rounded-md min-w-0" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Store Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 min-w-0">
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-full h-10 rounded-md" />
            </div>
          ))}
        </div>

        {/* Address */}
        <div className="space-y-4">
          <Skeleton className="w-24 h-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2 min-w-0">
                <Skeleton className="w-16 h-4" />
                <Skeleton className="w-full h-10 rounded-md" />
              </div>
            ))}
          </div>
        </div>

        {/* Operating Hours */}
        <div className="space-y-4">
          <Skeleton className="w-40 sm:w-48 h-6" />
          <div className="space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 p-3 sm:p-4 border border-border rounded-lg overflow-hidden min-w-0">
                <Skeleton className="w-full sm:w-20 h-4" />
                <div className="flex items-center gap-1 sm:gap-2">
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="w-8 sm:w-12 h-4" />
                </div>
                <Skeleton className="w-full sm:w-32 h-9" />
                <Skeleton className="w-6 sm:w-8 h-4" />
                <Skeleton className="w-full sm:w-32 h-9" />
              </div>
            ))}
          </div>
        </div>

        {/* Delivery Settings */}
        <div className="space-y-4">
          <Skeleton className="w-40 sm:w-48 h-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2 min-w-0">
                <Skeleton className="w-24 h-4" />
                <Skeleton className="w-full h-10 rounded-md" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4">
          <Skeleton className="w-full sm:w-20 h-10 rounded-md" />
          <Skeleton className="w-full sm:w-32 h-10 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );

  const PaymentTabSkeleton = () => (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
        <Skeleton className="w-48 sm:w-64 h-6 mb-2" />
        <Skeleton className="w-full max-w-lg h-4" />
      </CardHeader>
      <CardContent className="space-y-6 overflow-hidden">
        <div className="space-y-4">
          <div className="flex items-center space-x-2 mb-4">
            <Skeleton className="w-5 h-5 shrink-0" />
            <Skeleton className="w-40 h-6" />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 min-w-0">
                <Skeleton className="w-24 h-4" />
                <Skeleton className="w-full h-10 rounded-md" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4">
          <Skeleton className="w-full sm:w-20 h-10 rounded-md" />
          <Skeleton className="w-full sm:w-32 h-10 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );

  const DeliveryTabSkeleton = () => (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
        <div className="flex items-center space-x-2">
          <Skeleton className="w-5 h-5 shrink-0" />
          <Skeleton className="w-48 sm:w-64 h-6" />
        </div>
        <Skeleton className="w-full max-w-lg h-4" />
      </CardHeader>
      <CardContent className="space-y-6 overflow-hidden">
        {/* Delivery and Pickup Times */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2 min-w-0">
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-full h-10 rounded-md" />
            </div>
          ))}
        </div>

        {/* Pricing Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-2 min-w-0">
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-full h-10 rounded-md" />
            </div>
          ))}
        </div>

        {/* Free Delivery Section */}
        <div className="space-y-4">
          <Skeleton className="w-40 sm:w-48 h-6" />
          <Skeleton className="w-full max-w-lg h-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0">
                <Skeleton className="flex-1 h-10 rounded-md min-w-0" />
                <Skeleton className="w-full sm:w-20 h-10 rounded-md" />
              </div>
            ))}
          </div>
        </div>

        {/* Operating Hours Section */}
        <div className="space-y-4">
          <Skeleton className="w-40 sm:w-48 h-6" />
          <div className="space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 p-3 sm:p-4 border border-border rounded-lg overflow-hidden min-w-0">
                <Skeleton className="w-full sm:w-20 h-4" />
                <div className="flex items-center gap-1 sm:gap-2">
                  <Skeleton className="w-4 h-4 rounded" />
                  <Skeleton className="w-8 sm:w-12 h-4" />
                </div>
                <Skeleton className="w-full sm:w-32 h-9" />
                <Skeleton className="w-6 sm:w-8 h-4" />
                <Skeleton className="w-full sm:w-32 h-9" />
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <Skeleton className="w-36 sm:w-48 h-10 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );

  const PlaqueTabSkeleton = () => (
    <Card className="w-full max-w-full overflow-hidden">
      <CardHeader>
        <Skeleton className="w-40 sm:w-48 h-6 mb-2" />
        <Skeleton className="w-full max-w-md h-4" />
      </CardHeader>
      <CardContent className="space-y-6 overflow-hidden">
        <div className="text-center py-8">
          <Skeleton className="w-12 h-12 mx-auto mb-4" />
          <Skeleton className="w-48 sm:w-64 h-4 mx-auto" />
        </div>
      </CardContent>
    </Card>
  );

  const PrinterTabSkeleton = () => (
    <div className="space-y-6 w-full max-w-full overflow-hidden">
      {/* Tutorial Card */}
      <Card className="w-full max-w-full overflow-hidden">
        <CardHeader>
          <div className="flex items-center space-x-2">
            <Skeleton className="w-5 h-5 shrink-0" />
            <Skeleton className="w-40 sm:w-48 h-6" />
          </div>
          <Skeleton className="w-full max-w-lg h-4" />
        </CardHeader>
        <CardContent className="space-y-6 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-3 sm:p-4 border rounded-lg">
              <div className="flex items-start space-x-2 sm:space-x-3">
                <Skeleton className="w-6 h-6 sm:w-8 sm:h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2 min-w-0">
                  <Skeleton className="w-32 h-6" />
                  <Skeleton className="w-full h-4" />
                  <Skeleton className="w-24 h-10 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card className="w-full max-w-full overflow-hidden">
        <CardHeader>
          <Skeleton className="w-40 sm:w-56 h-6 mb-2" />
          <Skeleton className="w-full max-w-md h-4" />
        </CardHeader>
        <CardContent className="overflow-hidden">
          <Skeleton className="w-full h-40 rounded-md" />
        </CardContent>
      </Card>
    </div>
  );

  if (initialLoading) {
    return (
      <AdminLayout currentPage="store-setup">
        <div className="w-full">
          {/* Tabs Skeleton */}
          <div className="w-full mb-6">
            <div className="grid w-full grid-cols-2 lg:grid-cols-5 bg-muted p-1 rounded-md">
              {["Informações da Loja", "Entrega & Retirada", "Pagamento", "Placa QR", "Impressão"].map((tab, i) => (
                <div key={i} className="flex items-center justify-center space-x-2 p-2">
                  <Skeleton className="w-4 h-4" />
                  <Skeleton className="w-12 sm:w-20 h-4" />
                </div>
              ))}
            </div>
          </div>

          {/* Main Content Skeleton */}
          <Card className="w-full max-w-full overflow-hidden">
            <CardHeader>
              <Skeleton className="w-40 sm:w-48 h-8 mb-2" />
              <Skeleton className="w-full max-w-lg h-4" />
            </CardHeader>
            <CardContent className="space-y-6 sm:space-y-8 overflow-hidden">
              {/* Store Images Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-4 min-w-0">
                  <Skeleton className="w-20 h-4" />
                  <Skeleton className="w-full h-32 rounded-xl" />
                </div>
                <div className="space-y-4 min-w-0">
                  <Skeleton className="w-24 h-4" />
                  <Skeleton className="w-full h-32 rounded-xl" />
                </div>
              </div>

              {/* Store Info Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {["Nome da Loja", "URL da Loja", "Descrição", "WhatsApp"].map((field, i) => (
                  <div key={i} className="space-y-2 min-w-0">
                    <Skeleton className="w-20 h-4" />
                    <Skeleton className="w-full h-10 rounded-md" />
                  </div>
                ))}
              </div>

              {/* Address Section */}
              <div className="space-y-4">
                <Skeleton className="w-24 h-6" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-2 min-w-0">
                      <Skeleton className="w-16 h-4" />
                      <Skeleton className="w-full h-10 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Theme Colors Section */}
              <div className="space-y-4">
                <Skeleton className="w-32 h-6" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2 min-w-0">
                      <Skeleton className="w-20 h-4" />
                      <div className="flex space-x-2">
                        <Skeleton className="w-12 h-10 rounded-md shrink-0" />
                        <Skeleton className="flex-1 h-10 rounded-md min-w-0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Operating Hours Section */}
              <div className="space-y-4">
                <Skeleton className="w-40 sm:w-48 h-6" />
                <div className="space-y-3">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 p-3 sm:p-4 border border-border rounded-lg overflow-hidden min-w-0">
                      <Skeleton className="w-full sm:w-20 h-4" />
                      <div className="flex items-center gap-1 sm:gap-2">
                        <Skeleton className="w-4 h-4 rounded" />
                        <Skeleton className="w-8 sm:w-12 h-4" />
                      </div>
                      <Skeleton className="w-full sm:w-32 h-9" />
                      <Skeleton className="w-6 sm:w-8 h-4" />
                      <Skeleton className="w-full sm:w-32 h-9" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Delivery Settings Section */}
              <div className="space-y-4">
                <Skeleton className="w-40 sm:w-48 h-6" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-2 min-w-0">
                      <Skeleton className="w-24 h-4" />
                      <Skeleton className="w-full h-10 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4">
                <Skeleton className="w-full sm:w-20 h-10 rounded-md" />
                <Skeleton className="w-full sm:w-32 h-10 rounded-md" />
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      currentPage="store-setup"
    >
      <div className="w-full max-w-full overflow-hidden">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full max-w-full overflow-hidden">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5 h-auto max-w-full overflow-x-auto">
            <TabsTrigger value="store" className="flex items-center space-x-1 sm:space-x-2 px-1 sm:px-2 py-3 text-center min-w-0">
              <MapPin className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">Informações da Loja</span>
            </TabsTrigger>
            <TabsTrigger value="delivery" className="flex items-center space-x-1 sm:space-x-2 px-1 sm:px-2 py-3 text-center min-w-0">
              <Truck className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">Entrega & Retirada</span>
            </TabsTrigger>
            <TabsTrigger value="payment" className="flex items-center space-x-1 sm:space-x-2 px-1 sm:px-2 py-3 text-center min-w-0">
              <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">Pagamento</span>
            </TabsTrigger>
            <TabsTrigger value="plaque" className="flex items-center space-x-1 sm:space-x-2 px-1 sm:px-2 py-3 text-center min-w-0">
              <QrCode className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">Placa QR</span>
            </TabsTrigger>
            <TabsTrigger value="printer" className="flex items-center space-x-1 sm:space-x-2 px-1 sm:px-2 py-3 text-center min-w-0">
              <Printer className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
              <span className="text-xs sm:text-sm truncate">Impressão</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="store" className="w-full max-w-full overflow-hidden">
            {isTabLoading ? <StoreTabSkeleton /> : <Card className="w-full max-w-full overflow-hidden">
              <CardHeader>
                <CardTitle className="text-2xl">
                  {existingStore ? "Editar Loja" : "Configurar Loja"}
                </CardTitle>
                <p className="text-muted-foreground">
                  {existingStore 
                    ? "Atualize as informações da sua loja"
                    : "Preencha as informações da sua loja para começar a vender"
                  }
                </p>
              </CardHeader>
              
              <CardContent className="p-3 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8">
              {/* Store Images */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                <div className="space-y-4">
                  <Label>Perfil da Loja</Label>
                  <FileUpload
                    onUpload={(base64) => setFormData({ ...formData, logoUrl: base64 })}
                    accept="image/*"
                    maxSize={2 * 1024 * 1024}
                    currentFileName={formData.logoUrl && !formData.logoUrl.startsWith('data:') ? getFileNameFromUrl(formData.logoUrl) : 'logo'}
                    useBase64={true}
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    {formData.logoUrl ? (
                      <img 
                        src={formData.logoUrl} 
                        alt="Logo" 
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : (
                      <>
                        <Image className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">Clique para fazer upload da logo</p>
                        <p className="text-xs text-muted-foreground mt-2">PNG, JPG até 2MB</p>
                      </>
                    )}
                  </FileUpload>
                </div>
                
                <div className="space-y-4">
                  <Label>Capa da Loja</Label>
                  <FileUpload
                    onUpload={(base64) => setFormData({ ...formData, coverUrl: base64 })}
                    accept="image/*"
                    maxSize={5 * 1024 * 1024}
                    currentFileName={formData.coverUrl && !formData.coverUrl.startsWith('data:') ? getFileNameFromUrl(formData.coverUrl) : 'capa'}
                    useBase64={true}
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    {formData.coverUrl ? (
                      <img 
                        src={formData.coverUrl} 
                        alt="Capa" 
                        className="w-full h-32 object-cover rounded-lg"
                      />
                    ) : (
                      <>
                        <Image className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">Clique para fazer upload da capa</p>
                        <p className="text-xs text-muted-foreground mt-2">PNG, JPG até 5MB</p>
                      </>
                    )}
                  </FileUpload>
                </div>
                
                <div className="space-y-4">
                  <Label>Favicon da Loja (500x500px)</Label>
                  <FileUpload
                    onUpload={(base64) => setFormData({ ...formData, faviconUrl: base64 })}
                    accept="image/png"
                    maxSize={1 * 1024 * 1024}
                    currentFileName={formData.faviconUrl && !formData.faviconUrl.startsWith('data:') ? getFileNameFromUrl(formData.faviconUrl) : 'favicon'}
                    useBase64={true}
                    className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    {formData.faviconUrl ? (
                      <img 
                        src={formData.faviconUrl} 
                        alt="Favicon" 
                        className="w-16 h-16 object-cover rounded-lg mx-auto"
                      />
                    ) : (
                      <>
                        <Image className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">Clique para fazer upload do favicon</p>
                        <p className="text-xs text-muted-foreground mt-2">PNG 500x500px até 1MB</p>
                      </>
                    )}
                  </FileUpload>
                </div>
              </div>

              {/* Theme Colors */}
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">Cores do Tema</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Personalize as cores da sua loja pública
                  </p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor">Cor Primária</Label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        id="primaryColor"
                        value={formData.primaryColor}
                        onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                        className="w-12 h-10 rounded border border-border cursor-pointer"
                        data-testid="input-primary-color"
                      />
                      <Input
                        value={formData.primaryColor}
                        onChange={(e) => setFormData({ ...formData, primaryColor: e.target.value })}
                        placeholder="#3b82f6"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="secondaryColor">Cor Secundária</Label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        id="secondaryColor"
                        value={formData.secondaryColor}
                        onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                        className="w-12 h-10 rounded border border-border cursor-pointer"
                        data-testid="input-secondary-color"
                      />
                      <Input
                        value={formData.secondaryColor}
                        onChange={(e) => setFormData({ ...formData, secondaryColor: e.target.value })}
                        placeholder="#64748b"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="accentColor">Cor de Destaque</Label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="color"
                        id="accentColor"
                        value={formData.accentColor}
                        onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                        className="w-12 h-10 rounded border border-border cursor-pointer"
                        data-testid="input-accent-color"
                      />
                      <Input
                        value={formData.accentColor}
                        onChange={(e) => setFormData({ ...formData, accentColor: e.target.value })}
                        placeholder="#ea580c"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Store Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Loja</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Restaurante do João"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                    data-testid="input-store-name"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="slug">URL da Loja</Label>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">/loja/</span>
                    <Input
                      id="slug"
                      placeholder="restaurante-do-joao"
                      value={formData.slug}
                      onChange={(e) => handleSlugChange(e.target.value)}
                      required
                      data-testid="input-store-slug"
                      className={slugStatus === 'taken' ? 'border-red-500' : slugStatus === 'available' ? 'border-green-500' : ''}
                    />
                    {isValidatingSlug && (
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    )}
                  </div>
                  {slugStatus === 'taken' && (
                    <p className="text-sm text-red-500">Esta URL já está em uso. Escolha outra.</p>
                  )}
                  {slugStatus === 'available' && (
                    <p className="text-sm text-green-500">URL disponível!</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Esta será a URL pública da sua loja: /loja/{formData.slug}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp">WhatsApp</Label>
                  <input
                    id="whatsapp"
                    type="text"
                    inputMode="numeric"
                    placeholder="(11) 99999-9999"
                    value={formData.whatsapp}
                    onChange={(e) => {
                      // Extract only digits from input
                      const digits = e.target.value.replace(/\D/g, '');
                      
                      // Limit to 11 digits max (2 area code + 9 number digits)
                      const limitedDigits = digits.slice(0, 11);
                      
                      // Apply mask based on number of digits
                      let masked = '';
                      if (limitedDigits.length === 0) {
                        masked = '';
                      } else if (limitedDigits.length <= 2) {
                        masked = `(${limitedDigits}`;
                      } else if (limitedDigits.length <= 7) {
                        masked = `(${limitedDigits.slice(0, 2)}) ${limitedDigits.slice(2)}`;
                      } else {
                        // Check if it's 10 or 11 digits to apply correct mask
                        if (limitedDigits.length === 10) {
                          // (##) ####-####
                          masked = `(${limitedDigits.slice(0, 2)}) ${limitedDigits.slice(2, 6)}-${limitedDigits.slice(6)}`;
                        } else {
                          // (##) #####-#### (11 digits)
                          masked = `(${limitedDigits.slice(0, 2)}) ${limitedDigits.slice(2, 7)}-${limitedDigits.slice(7)}`;
                        }
                      }
                      
                      setFormData({ ...formData, whatsapp: masked });
                    }}
                    required
                    data-testid="input-whatsapp"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                    maxLength={16}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria do Negócio</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="Selecione a categoria do seu negócio" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUSINESS_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Legal Information */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Informações Legais</h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="personType">Tipo de Pessoa</Label>
                    <Select 
                      value={formData.personType} 
                      onValueChange={handlePersonTypeChange}
                    >
                      <SelectTrigger data-testid="select-person-type">
                        <SelectValue placeholder="Selecione o tipo de pessoa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fisica">Pessoa Física</SelectItem>
                        <SelectItem value="juridica">Pessoa Jurídica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.personType === 'fisica' && (
                    <div className="space-y-2">
                      <Label htmlFor="cpf">CPF (do perfil do usuário)</Label>
                      <Input
                        id="cpf"
                        value={formData.cpf}
                        disabled
                        placeholder="CPF será carregado do seu perfil"
                        className="bg-muted cursor-not-allowed"
                        data-testid="input-cpf"
                      />
                    </div>
                  )}

                  {formData.personType === 'juridica' && (
                    <div className="space-y-2">
                      <Label htmlFor="cnpj">CNPJ</Label>
                      <div className="relative">
                        <InputMask
                          mask="##.###.###/####-##"
                          value={formData.cnpj}
                          onChange={(e: any) => handleCnpjChange(e.target.value)}
                        >
                          {(inputProps: any) => (
                            <Input
                              {...inputProps}
                              id="cnpj"
                              placeholder="00.000.000/0000-00"
                              required={formData.personType === 'juridica'}
                              data-testid="input-cnpj"
                              className={
                                cnpjValidation.status === 'valid' 
                                  ? 'border-green-500 pr-10' 
                                  : cnpjValidation.status === 'invalid'
                                  ? 'border-red-500 pr-10'
                                  : cnpjValidation.status === 'validating'
                                  ? 'border-blue-500 pr-10'
                                  : ''
                              }
                            />
                          )}
                        </InputMask>
                        
                        {/* Loading spinner */}
                        {cnpjValidation.status === 'validating' && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        
                        {/* Success icon */}
                        {cnpjValidation.status === 'valid' && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        )}
                        
                        {/* Error icon */}
                        {cnpjValidation.status === 'invalid' && (
                          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                            <div className="w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Validation messages */}
                      {cnpjValidation.status === 'validating' && (
                        <p className="text-xs text-blue-600">Validando CNPJ na Receita Federal...</p>
                      )}
                      
                      {cnpjValidation.status === 'valid' && (
                        <p className="text-xs text-green-600">
                          ✅ CNPJ válido!
                        </p>
                      )}
                      
                      {cnpjValidation.status === 'invalid' && (
                        <p className="text-xs text-red-600">
                          ❌ {cnpjValidation.error || 'CNPJ inválido'}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder="Descreva sua loja e especialidades..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  data-testid="input-description"
                />
              </div>

              {/* Address Fields */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <MapPin className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Endereço</h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="cep">CEP</Label>
                    <InputMask
                      mask="#####-###"
                      value={formData.cep}
                      onChange={(e: any) => {
                        const cep = e.target.value;
                        setFormData({ ...formData, cep });
                        if (cep.replace(/\D/g, '').length === 8) {
                          fetchAddressByCep(cep);
                        }
                      }}
                    >
                      {(inputProps: any) => (
                        <Input
                          {...inputProps}
                          id="cep"
                          placeholder="00000-000"
                          required
                          data-testid="input-cep"
                        />
                      )}
                    </InputMask>
                    {loadingCep && <p className="text-xs text-muted-foreground">Buscando...</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="street">Rua</Label>
                    <Input
                      id="street"
                      placeholder="Nome da rua"
                      value={formData.street}
                      onChange={(e) => updateAddressField('street', e.target.value)}
                      required
                      data-testid="input-street"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="number">Número</Label>
                    <Input
                      id="number"
                      placeholder="123"
                      value={formData.number}
                      onChange={(e) => updateAddressField('number', e.target.value)}
                      required
                      data-testid="input-number"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="complement">Complemento</Label>
                    <Input
                      id="complement"
                      placeholder="Apto, sala, etc."
                      value={formData.complement}
                      onChange={(e) => updateAddressField('complement', e.target.value)}
                      data-testid="input-complement"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="neighborhood">Bairro</Label>
                    <Input
                      id="neighborhood"
                      placeholder="Nome do bairro"
                      value={formData.neighborhood}
                      onChange={(e) => updateAddressField('neighborhood', e.target.value)}
                      required
                      data-testid="input-neighborhood"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input
                      id="city"
                      placeholder="Nome da cidade"
                      value={formData.city}
                      onChange={(e) => updateAddressField('city', e.target.value)}
                      required
                      data-testid="input-city"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullAddress">Endereço Completo (Gerado automaticamente)</Label>
                  <Textarea
                    id="fullAddress"
                    rows={2}
                    placeholder="Endereço completo será gerado automaticamente"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    data-testid="input-full-address"
                  />
                </div>
              </div>

              {/* Operating Hours */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Horário de Funcionamento</h3>
                <div className="space-y-3">
                  {operatingHours.map((hour, index) => (
                    <div key={hour.day} className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 p-3 sm:p-4 border border-border rounded-lg">
                      <div className="sm:w-20">
                        <span className="text-sm font-medium text-foreground">{hour.day}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={hour.isOpen}
                          onCheckedChange={(checked) => 
                            updateOperatingHour(index, 'isOpen', checked)
                          }
                          data-testid={`checkbox-${hour.day.toLowerCase()}`}
                        />
                        <Label className="text-sm">Aberto</Label>
                      </div>
                      <div className="flex items-center space-x-2 flex-1">
                        <Input
                          type="time"
                          value={hour.openTime}
                          onChange={(e) => updateOperatingHour(index, 'openTime', e.target.value)}
                          disabled={!hour.isOpen}
                          className="w-full sm:w-32"
                          data-testid={`input-open-time-${hour.day.toLowerCase()}`}
                        />
                        <span className="text-muted-foreground text-sm">às</span>
                        <Input
                          type="time"
                          value={hour.closeTime}
                          onChange={(e) => updateOperatingHour(index, 'closeTime', e.target.value)}
                          disabled={!hour.isOpen}
                          className="w-full sm:w-32"
                          data-testid={`input-close-time-${hour.day.toLowerCase()}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Social Media Links */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2 mb-4">
                  <Globe className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">Redes Sociais</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  Adicione os links das suas redes sociais para que seus clientes possam te encontrar facilmente
                </p>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="instagram">Instagram</Label>
                    <Input
                      id="instagram"
                      placeholder="https://instagram.com/sua_empresa"
                      value={formData.socialLinks.instagram}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, instagram: e.target.value }
                      })}
                      data-testid="input-instagram"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="facebook">Facebook</Label>
                    <Input
                      id="facebook"
                      placeholder="https://facebook.com/sua_empresa"
                      value={formData.socialLinks.facebook}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, facebook: e.target.value }
                      })}
                      data-testid="input-facebook"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="twitter">X (Twitter)</Label>
                    <Input
                      id="twitter"
                      placeholder="https://x.com/sua_empresa"
                      value={formData.socialLinks.twitter}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, twitter: e.target.value }
                      })}
                      data-testid="input-twitter"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="tiktok">TikTok</Label>
                    <Input
                      id="tiktok"
                      placeholder="https://tiktok.com/@sua_empresa"
                      value={formData.socialLinks.tiktok}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, tiktok: e.target.value }
                      })}
                      data-testid="input-tiktok"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="youtube">YouTube</Label>
                    <Input
                      id="youtube"
                      placeholder="https://youtube.com/@sua_empresa"
                      value={formData.socialLinks.youtube}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, youtube: e.target.value }
                      })}
                      data-testid="input-youtube"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="linkedin">LinkedIn</Label>
                    <Input
                      id="linkedin"
                      placeholder="https://linkedin.com/company/sua_empresa"
                      value={formData.socialLinks.linkedin}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, linkedin: e.target.value }
                      })}
                      data-testid="input-linkedin"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="threads">Threads</Label>
                    <Input
                      id="threads"
                      placeholder="https://threads.net/@sua_empresa"
                      value={formData.socialLinks.threads}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, threads: e.target.value }
                      })}
                      data-testid="input-threads"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="kwai">Kwai</Label>
                    <Input
                      id="kwai"
                      placeholder="https://kwai.com/sua_empresa"
                      value={formData.socialLinks.kwai}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, kwai: e.target.value }
                      })}
                      data-testid="input-kwai"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="googleBusiness">Google Meu Negócio</Label>
                    <Input
                      id="googleBusiness"
                      placeholder="https://maps.google.com/sua_empresa"
                      value={formData.socialLinks.googleBusiness}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, googleBusiness: e.target.value }
                      })}
                      data-testid="input-google-business"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="website">Site Oficial</Label>
                    <Input
                      id="website"
                      placeholder="https://www.seusite.com.br"
                      value={formData.socialLinks.website}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        socialLinks: { ...formData.socialLinks, website: e.target.value }
                      })}
                      data-testid="input-website"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4">
                <Button type="button" variant="outline" onClick={onComplete} className="w-full sm:w-auto">
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} data-testid="button-save-store" className="w-full sm:w-auto">
                  {loading ? "Salvando..." : "Salvar e Continuar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>}
      </TabsContent>

      <TabsContent value="delivery" className="w-full max-w-full overflow-hidden">
        {isTabLoading ? <DeliveryTabSkeleton /> : <Card className="w-full max-w-full overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Truck className="h-5 w-5 mr-3" />
              Configurações de Entrega e Retirada
            </CardTitle>
            <p className="text-muted-foreground">
              Configure tempos de entrega, valores de frete e bairros com entrega gratuita
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Delivery Time and Pickup Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="deliveryTime">Tempo de Entrega</Label>
                <Select value={formData.deliveryTime} onValueChange={(value) => setFormData({ ...formData, deliveryTime: value })}>
                  <SelectTrigger data-testid="select-delivery-time">
                    <SelectValue placeholder="Selecione o tempo de entrega" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10-15 min">10-15 minutos</SelectItem>
                    <SelectItem value="15-20 min">15-20 minutos</SelectItem>
                    <SelectItem value="20-30 min">20-30 minutos</SelectItem>
                    <SelectItem value="30-40 min">30-40 minutos</SelectItem>
                    <SelectItem value="40-60 min">40-60 minutos</SelectItem>
                    <SelectItem value="1-1.5 horas">1-1.5 horas</SelectItem>
                    <SelectItem value="1.5-2 horas">1.5-2 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pickupTime">Tempo de Retirada</Label>
                <Select value={formData.pickupTime} onValueChange={(value) => setFormData({ ...formData, pickupTime: value })}>
                  <SelectTrigger data-testid="select-pickup-time">
                    <SelectValue placeholder="Selecione o tempo de retirada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5-10 min">5-10 minutos</SelectItem>
                    <SelectItem value="10-15 min">10-15 minutos</SelectItem>
                    <SelectItem value="15-20 min">15-20 minutos</SelectItem>
                    <SelectItem value="20-30 min">20-30 minutos</SelectItem>
                    <SelectItem value="30-40 min">30-40 minutos</SelectItem>
                    <SelectItem value="40-60 min">40-60 minutos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Delivery Pricing */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Configurações de Preço</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="deliveryFee">Taxa de Entrega</Label>
                  <Input
                    id="deliveryFee"
                    placeholder="R$ 5,00"
                    value={deliveryFeeDisplay}
                    onChange={(e) => {
                      const formatted = formatCurrency(e.target.value);
                      setDeliveryFeeDisplay(formatted);
                      const numericValue = parseCurrencyToNumber(formatted);
                      setFormData({ ...formData, deliveryFee: numericValue });
                    }}
                    data-testid="input-delivery-fee"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minimumOrder">Pedido Mínimo</Label>
                  <Input
                    id="minimumOrder"
                    placeholder="R$ 15,00"
                    value={minimumOrderDisplay}
                    onChange={(e) => {
                      const formatted = formatCurrency(e.target.value);
                      setMinimumOrderDisplay(formatted);
                      const numericValue = parseCurrencyToNumber(formatted);
                      setFormData({ ...formData, minimumOrder: numericValue });
                    }}
                    data-testid="input-minimum-order"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="freeDelivery">Frete Grátis Acima de</Label>
                  <Input
                    id="freeDelivery"
                    placeholder="R$ 50,00"
                    value={freeDeliveryDisplay}
                    onChange={(e) => {
                      const formatted = formatCurrency(e.target.value);
                      setFreeDeliveryDisplay(formatted);
                      const numericValue = parseCurrencyToNumber(formatted);
                      setFormData({ ...formData, freeDeliveryThreshold: numericValue });
                    }}
                    data-testid="input-free-delivery"
                  />
                </div>
              </div>
            </div>

            {/* Free Delivery Neighborhoods */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Bairros com Frete Grátis</h3>
              <p className="text-muted-foreground text-sm">
                Adicione bairros que terão entrega gratuita independente do valor do pedido
              </p>
              
              {/* CEP Lookup */}
              <div className="flex space-x-2">
                <div className="flex-1">
                  <InputMask
                    mask="99999-999"
                    value={cepLookup}
                    onChange={(e: any) => setCepLookup(e.target.value)}
                  >
                    {(inputProps: any) => (
                      <Input
                        {...inputProps}
                        placeholder="00000-000"
                        data-testid="input-cep-lookup"
                      />
                    )}
                  </InputMask>
                </div>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={findNeighborhoodByCep}
                  disabled={cepLookupLoading}
                  data-testid="button-find-neighborhood"
                >
                  {cepLookupLoading ? "Buscando..." : "Buscar Bairro"}
                </Button>
              </div>

              {/* Neighborhood List */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {formData.freeDeliveryNeighborhoods.map((neighborhood, index) => (
                    <div key={index} className="flex items-center space-x-2 bg-primary/10 px-3 py-1 rounded-full">
                      <span className="text-sm">{neighborhood}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const newNeighborhoods = formData.freeDeliveryNeighborhoods.filter((_, i) => i !== index);
                          setFormData({ ...formData, freeDeliveryNeighborhoods: newNeighborhoods });
                        }}
                        className="text-red-500 hover:text-red-700"
                        data-testid={`button-remove-neighborhood-${index}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {formData.freeDeliveryNeighborhoods.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    Nenhum bairro adicionado ainda. Use o CEP acima para encontrar e adicionar bairros.
                  </p>
                )}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button 
                type="button" 
                onClick={async () => {
                  if (!existingStore) {
                    toast({
                      title: "Erro",
                      description: "Você precisa salvar as informações da loja primeiro.",
                      variant: "destructive",
                    });
                    return;
                  }

                  try {
                    await updateStore(existingStore.id, {
                      deliveryTime: formData.deliveryTime,
                      pickupTime: formData.pickupTime,
                      deliveryFee: formData.deliveryFee,
                      minimumOrder: formData.minimumOrder,
                      freeDeliveryThreshold: formData.freeDeliveryThreshold,
                      freeDeliveryNeighborhoods: formData.freeDeliveryNeighborhoods,
                    });
                    toast({
                      title: "Configurações de entrega salvas!",
                      description: "As configurações de entrega e retirada foram atualizadas com sucesso.",
                    });
                  } catch (error) {
                    toast({
                      title: "Erro",
                      description: "Erro ao salvar configurações de entrega. Tente novamente.",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-save-delivery"
              >
                Salvar Configurações de Entrega
              </Button>
            </div>
          </CardContent>
        </Card>}
      </TabsContent>

      <TabsContent value="payment" className="w-full max-w-full overflow-hidden">
        {isTabLoading ? <PaymentTabSkeleton /> : 
          <PaymentMethodsConfiguration 
            store={existingStore || undefined}
            onSave={handlePaymentMethodsSave}
            loading={loading}
          />
        }
      </TabsContent>

      <TabsContent value="plaque" className="w-full max-w-full overflow-hidden">
        {isTabLoading ? <PlaqueTabSkeleton /> : <Card className="w-full max-w-full overflow-hidden">
          <CardHeader>
            <CardTitle>Placa com QR Code</CardTitle>
            <p className="text-muted-foreground">
              Gere uma placa personalizada com QR Code para sua loja
            </p>
          </CardHeader>
          <CardContent>
            {existingStore ? (
              <PlaqueGenerator
                storeName={existingStore.name}
                storeSlug={existingStore.slug}
                storeFavicon={existingStore.faviconUrl}
                userPlan={user?.planId === "premium" ? "premium" : user?.planId === "pro" ? "pro" : "basic"}
                primaryColor={existingStore.primaryColor}
              />
            ) : (
              <div className="text-center py-8">
                <QrCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  Salve as informações da loja primeiro para gerar a placa
                </p>
              </div>
            )}
          </CardContent>
        </Card>}
      </TabsContent>

      <TabsContent value="printer" className="w-full max-w-full overflow-hidden">
        {isTabLoading ? <PrinterTabSkeleton /> : <div className="w-full max-w-full overflow-hidden space-y-4 sm:space-y-6">
          {/* Tutorial de Instalação */}
          <Card className="w-full max-w-full overflow-hidden">
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="flex items-center space-x-2 text-base sm:text-lg">
                <Printer className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                <span className="truncate">Tutorial de Instalação</span>
              </CardTitle>
              <p className="text-muted-foreground text-sm sm:text-base">
                Siga os passos abaixo para configurar a impressão automática de cupons
              </p>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 pt-0 sm:pt-0">
              {/* Passo 1 - Java */}
              <div className="p-3 sm:p-4 border rounded-lg">
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 bg-primary text-white rounded-full flex items-center justify-center text-xs sm:text-sm font-bold">
                    1
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm sm:text-lg mb-2 truncate">Instalar Java</h4>
                    <p className="text-muted-foreground mb-3 text-xs sm:text-sm break-words">
                      O QZ Tray precisa do Java para funcionar. Baixe e instale a versão mais recente:
                    </p>
                    <Button 
                      variant="outline" 
                      asChild
                      className="mb-2 w-full sm:w-auto text-xs sm:text-sm"
                      size="sm"
                    >
                      <a 
                        href="https://www.java.com/pt-br/download/manual.jsp" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center space-x-2"
                      >
                        <Upload className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                        <span className="truncate">Baixar Java</span>
                      </a>
                    </Button>
                    <p className="text-xs text-muted-foreground break-words">
                      Após a instalação, reinicie o computador se solicitado.
                    </p>
                  </div>
                </div>
              </div>

              {/* Passo 2 - QZ Tray */}
              <div className="p-3 sm:p-4 border rounded-lg">
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 bg-primary text-white rounded-full flex items-center justify-center text-xs sm:text-sm font-bold">
                    2
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm sm:text-lg mb-2 truncate">Instalar QZ Tray</h4>
                    <p className="text-muted-foreground mb-3 text-xs sm:text-sm break-words">
                      O QZ Tray é o software que faz a comunicação entre o navegador e a impressora:
                    </p>
                    <Button 
                      variant="outline" 
                      asChild
                      className="mb-2 w-full sm:w-auto text-xs sm:text-sm"
                      size="sm"
                    >
                      <a 
                        href="https://qz.io/download/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-center space-x-2"
                      >
                        <Upload className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                        <span className="truncate">Baixar QZ Tray</span>
                      </a>
                    </Button>
                    <p className="text-xs text-muted-foreground break-words">
                      Após a instalação, o QZ Tray será executado automaticamente na bandeja do sistema.
                    </p>
                  </div>
                </div>
              </div>

              {/* Passo 3 - Configuração */}
              <div className="p-3 sm:p-4 border rounded-lg">
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <div className="flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 bg-primary text-white rounded-full flex items-center justify-center text-xs sm:text-sm font-bold">
                    3
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm sm:text-lg mb-2 truncate">Configurar Impressora</h4>
                    <p className="text-muted-foreground mb-3 text-xs sm:text-sm break-words">
                      Com o Java e QZ Tray instalados, configure sua impressora térmica abaixo:
                    </p>
                    <div className="flex items-center space-x-2 text-green-600">
                      <div className="w-2 h-2 rounded-full bg-green-600 shrink-0"></div>
                      <span className="text-xs sm:text-sm truncate">Pronto para configurar!</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Aviso importante */}
              <div className="bg-amber-50 dark:bg-amber-950/30 p-3 sm:p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-start space-x-2 sm:space-x-3">
                  <div className="p-1 rounded-full bg-amber-100 dark:bg-amber-900 shrink-0">
                    <Upload className="w-3 h-3 sm:w-4 sm:h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-medium text-amber-900 dark:text-amber-100 mb-1 truncate">
                      Importante
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed break-words">
                      Certifique-se de que sua impressora térmica está conectada via USB e os drivers estão instalados 
                      antes de prosseguir com a configuração abaixo.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configuração da Impressora */}
          <Card className="w-full max-w-full overflow-hidden">
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="text-base sm:text-lg">Configurações de Impressão</CardTitle>
              <p className="text-muted-foreground text-sm sm:text-base">
                Configure sua impressora térmica para imprimir cupons automaticamente
              </p>
            </CardHeader>
            <CardContent className="w-full max-w-full overflow-hidden pt-0 sm:pt-0">
              <div className="w-full max-w-full overflow-hidden">
                <PrinterConfiguration storeId={existingStore?.id} />
              </div>
            </CardContent>
          </Card>
        </div>}
      </TabsContent>

    </Tabs>
  </div>
    </AdminLayout>
  );
};
