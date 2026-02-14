import React, { useState } from 'react';
import { ThumbsUp, MessageSquare, ChevronDown, ChevronUp, Search, Filter, Send, Star } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTripSuggestions, type BrowseFilters, type TripSuggestion } from '@/hooks/useTripSuggestions';
import {
  INTEREST_TAGS,
  SUGGESTION_STATUSES,
  TRIP_CATEGORIES,
  REGIONS,
  MONTH_LABELS,
  ENTHUSIASM_LABELS,
} from '@/lib/tripSuggestionConstants';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const BrowseSuggestionsTab: React.FC = () => {
  const { useBrowseSuggestions, toggleVote, addComment, useComments } = useTripSuggestions();

  const [filters, setFilters] = useState<BrowseFilters>({
    search: '',
    status: 'all',
    category: 'all',
    region: 'all',
    tags: [],
    sortBy: 'newest',
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  const { data: suggestions = [], isLoading } = useBrowseSuggestions(filters);
  const { data: comments = [] } = useComments(expandedId);

  const handleVote = (suggestion: TripSuggestion) => {
    toggleVote.mutate({ suggestionId: suggestion.id, hasVoted: suggestion.user_voted || false });
  };

  const handleSubmitComment = () => {
    if (!expandedId || !commentText.trim()) return;
    addComment.mutate(
      { suggestionId: expandedId, body: commentText.trim() },
      { onSuccess: () => setCommentText('') }
    );
  };

  const getStatusBadge = (status: string) => {
    const config = SUGGESTION_STATUSES.find(s => s.value === status);
    if (!config) return <Badge variant="outline">{status}</Badge>;
    return <Badge className={cn(config.color, 'text-xs')}>{config.label}</Badge>;
  };

  const getTagLabel = (tagId: string) => {
    const tag = INTEREST_TAGS.find(t => t.id === tagId);
    return tag ? `${tag.icon} ${tag.label}` : tagId;
  };

  const getCategoryLabel = (cat: string) => {
    return TRIP_CATEGORIES.find(c => c.value === cat)?.label || cat;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search suggestions..."
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              className="pl-9"
            />
          </div>
        </div>
        <Select value={filters.status} onValueChange={(v) => setFilters(f => ({ ...f, status: v }))}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {SUGGESTION_STATUSES.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.category} onValueChange={(v) => setFilters(f => ({ ...f, category: v }))}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {TRIP_CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.region} onValueChange={(v) => setFilters(f => ({ ...f, region: v }))}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            {REGIONS.map(r => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.sortBy} onValueChange={(v: any) => setFilters(f => ({ ...f, sortBy: v }))}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest First</SelectItem>
            <SelectItem value="most_voted">Most Voted</SelectItem>
            <SelectItem value="enthusiasm">Enthusiasm</SelectItem>
            <SelectItem value="destination">Destination</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {isLoading ? 'Loading...' : `${suggestions.length} suggestion${suggestions.length !== 1 ? 's' : ''}`}
      </p>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Votes</TableHead>
              <TableHead>Destination</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="hidden lg:table-cell">Tags</TableHead>
              <TableHead className="hidden md:table-cell">Rating</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Submitted</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestions.length === 0 && !isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                  No suggestions found. Try adjusting your filters.
                </TableCell>
              </TableRow>
            ) : null}
            {suggestions.map((suggestion) => (
              <React.Fragment key={suggestion.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => setExpandedId(expandedId === suggestion.id ? null : suggestion.id)}
                >
                  <TableCell>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleVote(suggestion); }}
                      className={cn(
                        'flex flex-col items-center gap-0.5 p-1 rounded transition-colors',
                        suggestion.user_voted
                          ? 'text-primary'
                          : 'text-muted-foreground hover:text-primary'
                      )}
                    >
                      <ThumbsUp className={cn('w-4 h-4', suggestion.user_voted && 'fill-current')} />
                      <span className="text-xs font-semibold">{suggestion.vote_count || 0}</span>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium text-foreground">
                        {suggestion.destinations?.name || 'Unknown'}
                      </span>
                      {suggestion.destinations?.country && (
                        <span className="text-muted-foreground text-sm ml-1">
                          ({suggestion.destinations.country})
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                      {suggestion.description}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {getCategoryLabel(suggestion.trip_category)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {suggestion.tags.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {getTagLabel(tag)}
                        </Badge>
                      ))}
                      {suggestion.tags.length > 3 && (
                        <Badge variant="secondary" className="text-xs">+{suggestion.tags.length - 3}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            'w-3 h-3',
                            i < suggestion.enthusiasm_rating
                              ? 'text-warning fill-warning'
                              : 'text-muted-foreground/30'
                          )}
                        />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(suggestion.status)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    <div>{suggestion.submitter_name}</div>
                    <div>{format(new Date(suggestion.created_at), 'dd MMM yyyy')}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {(suggestion.comment_count || 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                          <MessageSquare className="w-3 h-3" />
                          {suggestion.comment_count}
                        </span>
                      )}
                      {expandedId === suggestion.id ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                {/* Expanded detail */}
                {expandedId === suggestion.id && (
                  <TableRow>
                    <TableCell colSpan={8} className="bg-muted/30 p-0">
                      <div className="p-4 space-y-4">
                        {/* Full description */}
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-1">Description</h4>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{suggestion.description}</p>
                        </div>

                        {/* Details grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {suggestion.destinations?.region && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Region</p>
                              <p className="text-sm">{suggestion.destinations.region}</p>
                            </div>
                          )}
                          {suggestion.destinations?.area && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Area</p>
                              <p className="text-sm">{suggestion.destinations.area}</p>
                            </div>
                          )}
                          {suggestion.estimated_duration && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Duration</p>
                              <p className="text-sm">{suggestion.estimated_duration}</p>
                            </div>
                          )}
                          {suggestion.nearest_bunker_text && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Nearest Bunker</p>
                              <p className="text-sm">{suggestion.nearest_bunker_text}</p>
                            </div>
                          )}
                          {suggestion.best_months && suggestion.best_months.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Best Months</p>
                              <p className="text-sm">{suggestion.best_months.map(m => MONTH_LABELS[m - 1]).join(', ')}</p>
                            </div>
                          )}
                          {suggestion.diving_level && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Diving Level</p>
                              <p className="text-sm capitalize">{suggestion.diving_level.replace('_', ' ')}</p>
                            </div>
                          )}
                          {suggestion.owner_visited && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Owner Visited</p>
                              <p className="text-sm capitalize">{suggestion.owner_visited}{suggestion.owner_visited_when ? ` (${suggestion.owner_visited_when})` : ''}</p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Enthusiasm</p>
                            <p className="text-sm">{ENTHUSIASM_LABELS[suggestion.enthusiasm_rating] || suggestion.enthusiasm_rating}</p>
                          </div>
                        </div>

                        {/* All tags */}
                        {suggestion.tags.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Tags</p>
                            <div className="flex flex-wrap gap-1">
                              {suggestion.tags.map(tag => (
                                <Badge key={tag} variant="secondary" className="text-xs">
                                  {getTagLabel(tag)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        <Separator />

                        {/* Comments */}
                        <div>
                          <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1">
                            <MessageSquare className="w-4 h-4" />
                            Comments ({comments.length})
                          </h4>

                          {comments.length > 0 && (
                            <div className="space-y-2 mb-3">
                              {comments.map((comment: any) => (
                                <div key={comment.id} className="bg-background rounded-lg p-3 border">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-foreground">{comment.author_name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(comment.created_at), 'dd MMM yyyy HH:mm')}
                                    </span>
                                  </div>
                                  <p className="text-sm text-muted-foreground">{comment.body}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Textarea
                              placeholder="Add a comment..."
                              value={commentText}
                              onChange={(e) => setCommentText(e.target.value)}
                              rows={2}
                              className="flex-1"
                            />
                            <Button
                              size="icon"
                              onClick={handleSubmitComment}
                              disabled={!commentText.trim() || addComment.isPending}
                            >
                              <Send className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default BrowseSuggestionsTab;
