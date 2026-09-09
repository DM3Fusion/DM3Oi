"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { RuleStatusFilter } from "@/lib/rule-filters";
export function RuleFilters({q,status}:{q:string;status:RuleStatusFilter}) {
  const pathname=usePathname();const router=useRouter();const [search,setSearch]=useState(q);const [previousQuery,setPreviousQuery]=useState(q);const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  if(q!==previousQuery){setPreviousQuery(q);setSearch(q);}
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
  const update=(next:string,nextStatus=status)=>{const params=new URLSearchParams(window.location.search);params.set("view","rules");const normalized=next.trim();if(normalized)params.set("q",normalized);else params.delete("q");if(nextStatus==="all")params.delete("status");else params.set("status",nextStatus);router.replace(`${pathname}?${params}`);};
  const change=(next:string)=>{setSearch(next);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>update(next),300);};
  return <form className="rule-filters" aria-label="Filter Rules" onSubmit={event=>event.preventDefault()}><label><span className="sr-only">Search Rules</span><span className="rule-search-control"><input type="search" value={search} onChange={event=>change(event.currentTarget.value)} placeholder="Search Rules..." maxLength={200}/>{search?<button type="button" aria-label="Clear Rule search" onClick={()=>{setSearch("");update("");}}>×</button>:null}</span></label><label className="rule-status"><span>Status</span><select value={status} onChange={event=>update(search,event.currentTarget.value as RuleStatusFilter)}><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label></form>;
}
