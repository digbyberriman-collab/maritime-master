import React from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  FolderOpen,
  FileText,
  Upload,
  Download,
  Archive,
  Bookmark,
  Tag,
  Search,
  Plus
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';

const MiscellaneousPage: React.FC = () => {
  const categories = [
    { name: 'Correspondence', icon: FileText, count: 0, color: 'text-blue-500' },
    { name: 'External Reports', icon: Download, count: 0, color: 'text-green-500' },
    { name: 'Archived Items', icon: Archive, count: 0, color: 'text-gray-500' },
    { name: 'Bookmarked', icon: Bookmark, count: 0, color: 'text-yellow-500' },
    { name: 'Tagged Items', icon: Tag, count: 0, color: 'text-purple-500' },
    { name: 'Uploads', icon: Upload, count: 0, color: 'text-orange-500' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          icon={<FolderOpen className="w-6 h-6" />}
          title="Miscellaneous"
          description="Other ISM-related documents and items"
          actions={
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          }
        />

        {/* Search */}
        <Card>
          <CardContent className="pt-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search miscellaneous items..."
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        <StatGrid cols={3}>
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <StatCard
                key={category.name}
                label={category.name}
                value={category.count}
                icon={<Icon className={`w-4 h-4 ${category.color}`} />}
                hint="items"
                className="cursor-pointer hover:shadow-md transition-shadow"
              />
            );
          })}
        </StatGrid>

        {/* Recent Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Items</CardTitle>
            <CardDescription>Recently added or modified miscellaneous items</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">No items yet</h3>
              <p className="text-muted-foreground mb-4">
                Add miscellaneous ISM documents and items here
              </p>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Upload Document
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button variant="outline" className="justify-start">
                <Upload className="w-4 h-4 mr-2" />
                Upload File
              </Button>
              <Button variant="outline" className="justify-start">
                <FileText className="w-4 h-4 mr-2" />
                Create Note
              </Button>
              <Button variant="outline" className="justify-start">
                <Tag className="w-4 h-4 mr-2" />
                Manage Tags
              </Button>
              <Button variant="outline" className="justify-start">
                <Archive className="w-4 h-4 mr-2" />
                View Archive
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default MiscellaneousPage;
