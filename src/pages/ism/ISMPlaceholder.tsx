import React from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, type LucideIcon } from 'lucide-react';

interface CardLink {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

interface ISMPlaceholderProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  sectionName?: string;
  contentType?: string;
  cards?: CardLink[];
}

const ISMPlaceholder: React.FC<ISMPlaceholderProps> = ({
  title,
  description,
  icon: Icon = FileText,
  sectionName,
  contentType = 'forms and templates',
  cards,
}) => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>

        {/* Cards grid for landing pages with subcategories */}
        {cards && cards.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <Link key={card.href} to={card.href} className="block">
                <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                        <card.icon className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{card.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{card.description}</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {/* Placeholder Content Card */}
        <Card className="border-border">
          <CardContent className="p-8 text-center">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              {sectionName || title} Coming Soon
            </h3>
            <p className="text-muted-foreground mb-4">
              This section will contain {contentType}.
            </p>
            <Button 
              disabled
              variant="secondary"
              className="cursor-not-allowed opacity-50"
            >
              Add Template (Coming Soon)
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default ISMPlaceholder;
