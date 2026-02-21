import { useState, useMemo } from 'react';
import { Search, Filter, LayoutGrid, List, BookOpen, ChevronDown, ChevronUp, ExternalLink, Plus } from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useCourseCatalogue, type DevelopmentCourse } from '@/modules/development/hooks/useDevelopment';
import CreateApplicationModal from '@/modules/development/components/CreateApplicationModal';
import {
  CATEGORY_CONFIG,
  FORMAT_LABELS,
  DEPARTMENTS,
  type DevCategory,
  type DevFormat,
} from '@/modules/development/constants';

export default function CourseCatalogue() {
  const [search, setSearch] = useState('');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<DevCategory[]>([]);
  const [selectedFormats, setSelectedFormats] = useState<DevFormat[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [applyingCourse, setApplyingCourse] = useState<DevelopmentCourse | null>(null);

  const { data: courses = [], isLoading } = useCourseCatalogue({
    search: search.length >= 2 ? search : undefined,
    departments: selectedDepartments.length ? selectedDepartments : undefined,
    categories: selectedCategories.length ? selectedCategories : undefined,
    formats: selectedFormats.length ? selectedFormats : undefined,
  });

  const groupedCourses = useMemo(() => {
    const groups: Record<string, DevelopmentCourse[]> = {};
    courses.forEach((course) => {
      const key = course.sub_section || `${course.department} — General`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(course);
    });
    return groups;
  }, [courses]);

  const toggleDepartment = (dept: string) => {
    setSelectedDepartments((prev) =>
      prev.includes(dept) ? prev.filter((d) => d !== dept) : [...prev, dept]
    );
  };

  const toggleCategory = (cat: DevCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleFormat = (fmt: DevFormat) => {
    setSelectedFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt]
    );
  };

  const clearFilters = () => {
    setSelectedDepartments([]);
    setSelectedCategories([]);
    setSelectedFormats([]);
    setSearch('');
  };

  const hasFilters = selectedDepartments.length > 0 || selectedCategories.length > 0 || selectedFormats.length > 0 || search.length > 0;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Course Catalogue</h1>
            <p className="text-muted-foreground">
              {courses.length} course{courses.length !== 1 ? 's' : ''} available
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="icon"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Filters */}
          <div className="lg:w-64 shrink-0">
            <Card>
              <CardContent className="p-4 space-y-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search courses..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
                    Clear All Filters
                  </Button>
                )}

                <Separator />

                <div>
                  <h3 className="text-sm font-medium mb-3">Category</h3>
                  <div className="space-y-2">
                    {(Object.entries(CATEGORY_CONFIG) as [DevCategory, typeof CATEGORY_CONFIG[DevCategory]][]).map(
                      ([key, config]) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={selectedCategories.includes(key)}
                            onCheckedChange={() => toggleCategory(key)}
                          />
                          <Badge variant="outline" className={`${config.bgClass} ${config.textClass} border-0 text-xs`}>
                            {config.label}
                          </Badge>
                        </label>
                      )
                    )}
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium mb-3">Department</h3>
                  <ScrollArea className="max-h-48">
                    <div className="space-y-2">
                      {DEPARTMENTS.map((dept) => (
                        <label key={dept} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox
                            checked={selectedDepartments.includes(dept)}
                            onCheckedChange={() => toggleDepartment(dept)}
                          />
                          {dept}
                        </label>
                      ))}
                    </div>
                  </ScrollArea>
                </div>

                <Separator />

                <div>
                  <h3 className="text-sm font-medium mb-3">Format</h3>
                  <div className="space-y-2">
                    {(Object.entries(FORMAT_LABELS) as [DevFormat, string][]).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedFormats.includes(key)}
                          onCheckedChange={() => toggleFormat(key)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="flex items-center justify-center min-h-[300px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : courses.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-1">No Courses Found</h3>
                  <p className="text-muted-foreground text-sm">
                    {hasFilters ? 'Try adjusting your filters' : 'No courses available yet'}
                  </p>
                  {hasFilters && (
                    <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
                      Clear Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-8">
                {Object.entries(groupedCourses).map(([section, sectionCourses]) => (
                  <div key={section}>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {section}
                    </h2>
                    <div
                      className={
                        viewMode === 'grid'
                          ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'
                          : 'space-y-3'
                      }
                    >
                      {sectionCourses.map((course) => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          expanded={expandedCourse === course.id}
                          onToggle={() =>
                            setExpandedCourse(expandedCourse === course.id ? null : course.id)
                          }
                          onApply={() => setApplyingCourse(course)}
                          viewMode={viewMode}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateApplicationModal
        open={!!applyingCourse}
        onOpenChange={(open) => !open && setApplyingCourse(null)}
        course={applyingCourse}
      />
    </DashboardLayout>
  );
}

function CourseCard({
  course,
  expanded,
  onToggle,
  onApply,
  viewMode,
}: {
  course: DevelopmentCourse;
  expanded: boolean;
  onToggle: () => void;
  onApply: () => void;
  viewMode: 'grid' | 'list';
}) {
  const catConfig = CATEGORY_CONFIG[course.category];

  if (viewMode === 'list') {
    return (
      <Card className="hover:border-primary/30 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-medium">{course.name}</h3>
                {course.over_4k_rule && (
                  <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-0">
                    &gt;$4K rule
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} border-0 text-xs`}>
                  {catConfig.label}
                </Badge>
                <span className="text-muted-foreground">{course.department}</span>
                {course.format && (
                  <span className="text-muted-foreground">• {FORMAT_LABELS[course.format]}</span>
                )}
                {course.duration_description && (
                  <span className="text-muted-foreground">• {course.duration_description}</span>
                )}
                {course.renewal_period && course.renewal_period !== '—' && (
                  <span className="text-muted-foreground">• Renew: {course.renewal_period}</span>
                )}
              </div>
              {expanded && (
                <div className="mt-3 space-y-2 text-sm">
                  {course.reimbursement_summary && (
                    <p><span className="font-medium">Reimbursement:</span> {course.reimbursement_summary}</p>
                  )}
                  {course.notes && (
                    <p className="text-muted-foreground">{course.notes}</p>
                  )}
                  {course.contact_person && (
                    <p><span className="font-medium">Contact:</span> {course.contact_person}</p>
                  )}
                  <Button size="sm" onClick={onApply}>
                    <Plus className="h-3 w-3 mr-1" /> Apply
                  </Button>
                </div>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={onToggle}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hover:border-primary/30 transition-colors h-fit">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline" className={`${catConfig.bgClass} ${catConfig.textClass} border-0 text-xs shrink-0`}>
            {catConfig.label}
          </Badge>
          {course.over_4k_rule && (
            <Badge variant="outline" className="text-xs bg-destructive/10 text-destructive border-0 shrink-0">
              &gt;$4K
            </Badge>
          )}
        </div>

        <h3 className="font-medium leading-tight">{course.name}</h3>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="text-xs">{course.department}</Badge>
          {course.format && (
            <Badge variant="outline" className="text-xs">{FORMAT_LABELS[course.format]}</Badge>
          )}
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          {course.duration_description && <p>Duration: {course.duration_description}</p>}
          {course.renewal_period && course.renewal_period !== '—' && <p>Renewal: {course.renewal_period}</p>}
          {course.reimbursement_summary && <p>Reimb: {course.reimbursement_summary}</p>}
        </div>

        {expanded && (
          <div className="pt-2 border-t text-sm space-y-2">
            {course.notes && <p className="text-muted-foreground">{course.notes}</p>}
            {course.contact_person && (
              <p><span className="font-medium text-xs">Contact:</span> {course.contact_person}</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="flex-1" onClick={onToggle}>
            {expanded ? 'Show Less' : 'View Details'}
            {expanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
          {expanded && (
            <Button size="sm" onClick={onApply}>
              <Plus className="h-3 w-3 mr-1" /> Apply
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
