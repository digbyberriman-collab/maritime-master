import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Vessel, VesselFormData } from '@/hooks/useVessels';
import { Loader2 } from 'lucide-react';

const currentYear = new Date().getFullYear();

const vesselSchema = z.object({
  name: z.string().min(1, 'Vessel name is required').max(100),
  imo_number: z
    .string()
    .min(1, 'IMO number is required')
    .regex(/^\d{7}$/, 'IMO number must be exactly 7 digits'),
  flag_state: z.string().min(1, 'Flag state is required'),
  classification_society: z.string().min(1, 'Classification society is required'),
  vessel_type: z.string().min(1, 'Vessel type is required'),
  gross_tonnage: z.coerce.number().positive().nullable().optional(),
  build_year: z.coerce
    .number()
    .min(1900, 'Build year must be 1900 or later')
    .max(currentYear, `Build year cannot exceed ${currentYear}`)
    .nullable()
    .optional(),
  status: z.string().default('Active'),
});

type VesselFormValues = z.infer<typeof vesselSchema>;

interface VesselFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel?: Vessel | null;
  onSubmit: (data: VesselFormData) => Promise<void>;
  isLoading?: boolean;
}

const FLAG_STATES = [
  'Cayman Islands',
  'Marshall Islands',
  'Malta',
  'United Kingdom',
  'Bahamas',
  'Panama',
  'Bermuda',
  'Isle of Man',
  'Gibraltar',
  'Netherlands',
  'Luxembourg',
  'Monaco',
  'British Virgin Islands',
];

const CLASSIFICATION_SOCIETIES = [
  "Lloyd's Register",
  'DNV',
  'ABS (American Bureau of Shipping)',
  'Bureau Veritas',
  'RINA',
  'ClassNK',
  'Korean Register',
  'China Classification Society',
];

const VESSEL_TYPES = [
  'Motor Yacht',
  'Sailing Yacht',
  'Explorer Yacht',
  'Catamaran',
  'Trimaran',
  'Commercial',
  'Support Vessel',
];

const VesselFormModal: React.FC<VesselFormModalProps> = ({
  open,
  onOpenChange,
  vessel,
  onSubmit,
  isLoading,
}) => {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<VesselFormValues>({
    resolver: zodResolver(vesselSchema),
    defaultValues: {
      name: '',
      imo_number: '',
      flag_state: '',
      classification_society: '',
      vessel_type: '',
      gross_tonnage: null,
      build_year: null,
      status: 'Active',
    },
  });

  useEffect(() => {
    if (vessel) {
      reset({
        name: vessel.name,
        imo_number: vessel.imo_number ?? '',
        flag_state: vessel.flag_state ?? '',
        classification_society: vessel.classification_society ?? '',
        vessel_type: vessel.vessel_type ?? '',
        gross_tonnage: vessel.gross_tonnage,
        build_year: vessel.build_year,
        status: vessel.status ?? 'Active',
      });
    } else {
      reset({
        name: '',
        imo_number: '',
        flag_state: '',
        classification_society: '',
        vessel_type: '',
        gross_tonnage: null,
        build_year: null,
        status: 'Active',
      });
    }
  }, [vessel, reset, open]);

  const handleFormSubmit = async (data: VesselFormValues) => {
    await onSubmit({
      name: data.name,
      imo_number: data.imo_number,
      flag_state: data.flag_state,
      classification_society: data.classification_society,
      vessel_type: data.vessel_type,
      gross_tonnage: data.gross_tonnage ?? null,
      build_year: data.build_year ?? null,
      status: data.status,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {vessel ? 'Edit Vessel' : 'Add Vessel'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Vessel Name *</Label>
              <Input
                id="name"
                {...register('name')}
                placeholder="Enter vessel name"
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="imo_number">IMO Number *</Label>
              <Input
                id="imo_number"
                {...register('imo_number')}
                placeholder="1234567"
                maxLength={7}
              />
              {errors.imo_number && (
                <p className="text-sm text-destructive">{errors.imo_number.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="flag_state">Flag State *</Label>
              <Select
                value={watch('flag_state')}
                onValueChange={(value) => setValue('flag_state', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select flag state" />
                </SelectTrigger>
                <SelectContent>
                  {FLAG_STATES.map((flag) => (
                    <SelectItem key={flag} value={flag}>
                      {flag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.flag_state && (
                <p className="text-sm text-destructive">{errors.flag_state.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="classification_society">Classification Society *</Label>
              <Select
                value={watch('classification_society')}
                onValueChange={(value) => setValue('classification_society', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select classification society" />
                </SelectTrigger>
                <SelectContent>
                  {CLASSIFICATION_SOCIETIES.map((society) => (
                    <SelectItem key={society} value={society}>
                      {society}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.classification_society && (
                <p className="text-sm text-destructive">{errors.classification_society.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vessel_type">Vessel Type *</Label>
              <Select
                value={watch('vessel_type')}
                onValueChange={(value) => setValue('vessel_type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vessel type" />
                </SelectTrigger>
                <SelectContent>
                  {VESSEL_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.vessel_type && (
                <p className="text-sm text-destructive">{errors.vessel_type.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gross_tonnage">Gross Tonnage</Label>
                <Input
                  id="gross_tonnage"
                  type="number"
                  {...register('gross_tonnage')}
                  placeholder="e.g., 500"
                />
                {errors.gross_tonnage && (
                  <p className="text-sm text-destructive">{errors.gross_tonnage.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="build_year">Build Year</Label>
                <Input
                  id="build_year"
                  type="number"
                  {...register('build_year')}
                  placeholder="e.g., 2020"
                  min={1900}
                  max={currentYear}
                />
                {errors.build_year && (
                  <p className="text-sm text-destructive">{errors.build_year.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={watch('status')}
                onValueChange={(value) => setValue('status', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Laid-up">Laid-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : vessel ? (
                'Update Vessel'
              ) : (
                'Add Vessel'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default VesselFormModal;
