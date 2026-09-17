import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Vessel, VesselFormData } from '@/modules/vessels/hooks/useVessels';
import { Loader2 } from 'lucide-react';

const currentYear = new Date().getFullYear();

const blankToNull = (v: unknown) =>
  v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? null : v;

const optionalNumber = z.preprocess(
  blankToNull,
  z.coerce
    .number()
    .transform((v) => (Number.isNaN(v) ? null : v))
    .nullable()
    .optional(),
);

const vesselSchema = z.object({
  name: z.string().min(1, 'Vessel name is required').max(120),
  imo_number: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{7}$/.test(v), 'IMO number must be exactly 7 digits')
    .optional(),
  mmsi: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{9}$/.test(v), 'MMSI must be exactly 9 digits')
    .optional(),
  call_sign: z.string().trim().max(20).optional(),
  flag_state: z.string().optional(),
  classification_society: z.string().optional(),
  vessel_type: z.string().optional(),
  builder: z.string().trim().max(120).optional(),
  home_port: z.string().trim().max(120).optional(),
  gross_tonnage: optionalNumber,
  build_year: z
    .union([z.coerce.number().min(1900, 'Build year must be 1900 or later').max(currentYear, `Build year cannot exceed ${currentYear}`), z.literal(''), z.null()])
    .transform((v) => (v === '' || v === null || Number.isNaN(v) ? null : (v as number)))
    .nullable()
    .optional(),
  length_overall: optionalNumber,
  beam: optionalNumber,
  draft: optionalNumber,
  status: z.string().default('Active'),
  operational_status: z.string().optional(),
});

type VesselFormValues = z.input<typeof vesselSchema>;
type VesselFormOutput = z.output<typeof vesselSchema>;

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

const OPERATIONAL_STATUSES = ['In Service', 'At Anchor', 'In Transit', 'In Yard', 'Refit', 'Laid-up'];

const withCurrent = (options: string[], current?: string | null) =>
  current && !options.includes(current) ? [current, ...options] : options;

const emptyValues: VesselFormValues = {
  name: '',
  imo_number: '',
  mmsi: '',
  call_sign: '',
  flag_state: '',
  classification_society: '',
  vessel_type: '',
  builder: '',
  home_port: '',
  gross_tonnage: '',
  build_year: '',
  length_overall: '',
  beam: '',
  draft: '',
  status: 'Active',
  operational_status: '',
};

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
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (vessel) {
      reset({
        name: vessel.name ?? '',
        imo_number: vessel.imo_number ?? '',
        mmsi: vessel.mmsi ?? '',
        call_sign: vessel.call_sign ?? '',
        flag_state: vessel.flag_state ?? '',
        classification_society: vessel.classification_society ?? '',
        vessel_type: vessel.vessel_type ?? '',
        builder: vessel.builder ?? '',
        home_port: vessel.home_port ?? '',
        gross_tonnage: vessel.gross_tonnage ?? '',
        build_year: vessel.build_year ?? '',
        length_overall: vessel.length_overall ?? '',
        beam: vessel.beam ?? '',
        draft: vessel.draft ?? '',
        status: vessel.status ?? 'Active',
        operational_status: vessel.operational_status ?? '',
      });
    } else {
      reset(emptyValues);
    }
  }, [vessel, reset, open]);

  const handleFormSubmit = async (data: VesselFormOutput) => {
    await onSubmit({
      name: data.name.trim(),
      imo_number: data.imo_number?.trim() || null,
      mmsi: data.mmsi?.trim() || null,
      call_sign: data.call_sign?.trim() || null,
      flag_state: data.flag_state || null,
      classification_society: data.classification_society || null,
      vessel_type: data.vessel_type || null,
      builder: data.builder?.trim() || null,
      home_port: data.home_port?.trim() || null,
      gross_tonnage: data.gross_tonnage ?? null,
      build_year: data.build_year ?? null,
      length_overall: data.length_overall ?? null,
      beam: data.beam ?? null,
      draft: data.draft ?? null,
      status: data.status || 'Active',
      operational_status: data.operational_status || null,
    });
    onOpenChange(false);
  };

  const selectField = (
    field: 'flag_state' | 'classification_society' | 'vessel_type' | 'operational_status',
    label: string,
    options: string[],
    placeholder: string,
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select
        value={(watch(field) as string) || undefined}
        onValueChange={(value) => setValue(field, value, { shouldDirty: true })}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {withCurrent(options, watch(field) as string).map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{vessel ? `Edit ${vessel.name}` : 'Add Vessel'}</DialogTitle>
          <DialogDescription>
            Only the vessel name is required — fill in the rest whenever the details are confirmed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(handleFormSubmit as never)} className="space-y-4">
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Vessel Name *</Label>
                <Input id="name" {...register('name')} placeholder="Enter vessel name" />
                {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="imo_number">IMO Number</Label>
                  <Input id="imo_number" {...register('imo_number')} placeholder="1234567" maxLength={7} />
                  {errors.imo_number && (
                    <p className="text-sm text-destructive">{errors.imo_number.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mmsi">MMSI</Label>
                  <Input id="mmsi" {...register('mmsi')} placeholder="123456789" maxLength={9} />
                  {errors.mmsi && <p className="text-sm text-destructive">{errors.mmsi.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="call_sign">Call Sign</Label>
                  <Input id="call_sign" {...register('call_sign')} placeholder="e.g., ZCDU9" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectField('flag_state', 'Flag State', FLAG_STATES, 'Select flag state')}
                {selectField(
                  'classification_society',
                  'Classification Society',
                  CLASSIFICATION_SOCIETIES,
                  'Select classification society',
                )}
                {selectField('vessel_type', 'Vessel Type', VESSEL_TYPES, 'Select vessel type')}
                {selectField(
                  'operational_status',
                  'Operational Status',
                  OPERATIONAL_STATUSES,
                  'Select operational status',
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="builder">Builder</Label>
                  <Input id="builder" {...register('builder')} placeholder="e.g., Damen" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="home_port">Home Port</Label>
                  <Input id="home_port" {...register('home_port')} placeholder="e.g., Palma" />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gross_tonnage">Gross Tonnage</Label>
                  <Input id="gross_tonnage" type="number" step="any" {...register('gross_tonnage')} placeholder="500" />
                  {errors.gross_tonnage && (
                    <p className="text-sm text-destructive">{errors.gross_tonnage.message as string}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="build_year">Build Year</Label>
                  <Input
                    id="build_year"
                    type="number"
                    {...register('build_year')}
                    placeholder="2020"
                    min={1900}
                    max={currentYear}
                  />
                  {errors.build_year && (
                    <p className="text-sm text-destructive">{errors.build_year.message as string}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="length_overall">Length Overall (m)</Label>
                  <Input id="length_overall" type="number" step="any" {...register('length_overall')} placeholder="60" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="beam">Beam (m)</Label>
                  <Input id="beam" type="number" step="any" {...register('beam')} placeholder="11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="draft">Draft (m)</Label>
                  <Input id="draft" type="number" step="any" {...register('draft')} placeholder="3.4" />
                </div>
                <div className="space-y-2">
                  <Label>Fleet Status</Label>
                  <Select
                    value={(watch('status') as string) || 'Active'}
                    onValueChange={(value) => setValue('status', value, { shouldDirty: true })}
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
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : vessel ? (
                'Save Changes'
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
