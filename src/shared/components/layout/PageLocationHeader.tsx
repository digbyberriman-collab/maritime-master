import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { resolvePageNavigation } from '@/shared/lib/pageNavigation';

interface PageLocationHeaderProps {
  activeModuleId?: string | null;
}

const PageLocationHeader: React.FC<PageLocationHeaderProps> = ({ activeModuleId }) => {
  const location = useLocation();
  const page = React.useMemo(
    () => resolvePageNavigation(location.pathname, location.search, activeModuleId),
    [activeModuleId, location.pathname, location.search],
  );

  React.useEffect(() => {
    document.title = `${page.title} | STORM`;
  }, [page.title]);

  return (
    <div className="mb-5 border-b border-border pb-4">
      <Breadcrumb>
        <BreadcrumbList className="gap-1 text-xs sm:gap-1.5">
          {page.crumbs.map((crumb, index) => {
            const current = index === page.crumbs.length - 1;
            return (
              <React.Fragment key={`${crumb.label}-${index}`}>
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {!current && crumb.path ? (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.path}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">{page.title}</h1>
    </div>
  );
};

export default PageLocationHeader;