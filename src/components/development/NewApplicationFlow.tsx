import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Search, BookOpen, PenLine, ChevronRight, ArrowLeft, Loader2 } from 'lucide-react';
import { useCourseCatalogue, type DevelopmentCourse } from '@/hooks/useDevelopment';
import CreateApplicationModal from '@/components/development/CreateApplicationModal';
import {
  CATEGORY_CONFIG,
  FORMAT_LABELS,
  DEPARTMENTS,
  type DevCategory,
} from '@/lib/developmentConstants';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'choose' | 'browse' | 'custom-form' | 'catalogue-form';

export default function NewApplicationFlow({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedCourse, setSelectedCourse] = useState<DevelopmentCourse | null>(null);

  const { data: courses = [], isLoading } = useCourseCatalogue({
    search: search.length >= 2 ? search : undefined,
    departments: selectedDept ? [selectedDept] : undefined,
  });

  const filteredCourses = useMemo(() => courses.slice(0, 50), [courses]);

  const reset = () => {
    setStep('choose');
    setSearch('');
    setSelectedDept('');
    setSelectedCourse(null);
  };

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  // When CreateApplicationModal closes, close the whole flow
  const handleFormClose = (open: boolean) => {
    if (!open) {
      reset();
      onOpenChange(false);
    }
  };

  // Show CreateApplicationModal for catalogue course
  if (step === 'catalogue-form' && selectedCourse) {
    return (
      <CreateApplicationModal
        open={true}
        onOpenChange={handleFormClose}
        course={selectedCourse}
      />
    );
  }

  // Show CreateApplicationModal for custom course
  if (step === 'custom-form') {
    return (
      <CreateApplicationModal
        open={true}
        onOpenChange={handleFormClose}
        course={null}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {step === 'browse' && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setStep('choose')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <DialogTitle>
              {step === 'choose' ? 'New Development Application' : 'Select a Course'}
            </DialogTitle>
          </div>
        </DialogHeader>

        {step === 'choose' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => setStep('browse')}
            >
              <CardContent className="p-6 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">From Catalogue</h3>
                <p className="text-sm text-muted-foreground">
                  Choose from the approved course catalogue with pre-set reimbursement rules
                </p>
                <ChevronRight className="h-4 w-4 mx-auto text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => setStep('custom-form')}
            >
              <CardContent className="p-6 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-accent/50 flex items-center justify-center group-hover:bg-accent transition-colors">
                  <PenLine className="h-6 w-6 text-accent-foreground" />
                </div>
                <h3 className="font-semibold">Custom Course</h3>
                <p className="text-sm text-muted-foreground">
                  Apply for a course not in the catalogue — requires additional details and Captain approval
                </p>
                <ChevronRight className="h-4 w-4 mx-auto text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'browse' && (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Search & filter */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search courses..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
              </div>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All Departments</option>
                {DEPARTMENTS.filter(d => d !== 'All').map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <Separator />

            {/* Course list */}
            <ScrollArea className="flex-1 min-h-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No courses found</p>
                </div>
              ) : (
                <div className="space-y-2 pr-4">
                  {filteredCourses.map((course) => {
                    const catConfig = CATEGORY_CONFIG[course.category];
                    return (
                      <button
                        key={course.id}
                        className="w-full text-left p-3 rounded-lg border hover:border-primary/40 hover:bg-accent/30 transition-colors"
                        onClick={() => {
                          setSelectedCourse(course);
                          setStep('catalogue-form');
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{course.name}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} border-0 text-xs`}>
                                {catConfig.label}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{course.department}</span>
                              {course.format && (
                                <span className="text-xs text-muted-foreground">• {FORMAT_LABELS[course.format]}</span>
                              )}
                              {course.duration_description && (
                                <span className="text-xs text-muted-foreground">• {course.duration_description}</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
