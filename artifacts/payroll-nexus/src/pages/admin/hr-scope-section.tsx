/**
 * Organization + business Client assignment for application users.
 * Supports multiple Organizations, with one or more UNITMASTER Clients under each.
 * Persistence uses USERCOMPANY + USERUNIT.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Info, Loader2, Search, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}` });

export interface ScopeData {
  companies: number[];
  branches:  { compid: number; branchcode: number }[];
  clients:   { compid: number; branchcode: number; clientcode: number }[];
  units:     { compid: number; unitcode: string }[];
}

export const EMPTY_SCOPE: ScopeData = { companies: [], branches: [], clients: [], units: [] };

interface CompanyMasterRow {
  compid: number;
  comname: string | null;
  city: string | null;
  state: string | null;
  corpID?: string | null;
  orgCode?: string | null;
  displayLabel?: string | null;
}

interface UnitMasterRow {
  unitcode: string;
  Unitname: string | null;
  compcode: number;
  city?: string | null;
  state?: string | null;
}

interface Props {
  value: ScopeData;
  onChange: (scope: ScopeData) => void;
  roleLabel?: string;
}

export default function HRScopeSection({ value, onChange, roleLabel = "user" }: Props) {
  const [orgOpen, setOrgOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");
  const [clientOpenFor, setClientOpenFor] = useState<number | null>(null);
  const [clientSearch, setClientSearch] = useState<Record<number, string>>({});

  const { data: companies = [], isLoading: isLoadingCompanies, isError: isCompaniesError } = useQuery<CompanyMasterRow[]>({
    queryKey: ["master-companies", "user-scope"],
    queryFn: async () => {
      const r = await fetch("/api/masters/companies", { headers: hdr() });
      if (!r.ok) throw new Error("Unable to load organizations");
      return r.json();
    },
    staleTime: 120_000,
  });

  // Fetch once and group locally. This keeps multi-organization editing responsive
  // and avoids one request per selected Organization.
  const { data: units = [], isLoading: isLoadingUnits, isError: isUnitsError } = useQuery<UnitMasterRow[]>({
    queryKey: ["master-units", "user-scope", "all"],
    queryFn: async () => {
      const r = await fetch("/api/masters/units", { headers: hdr() });
      if (!r.ok) throw new Error("Unable to load clients");
      return r.json();
    },
    staleTime: 120_000,
  });

  const companyOptions = useMemo(() => companies
    .map((row) => ({
      compid: Number(row.compid),
      companyName: row.comname?.trim() || `Company ${row.compid}`,
      orgCode: row.orgCode?.trim() || row.corpID?.trim() || "",
      displayLabel: row.displayLabel?.trim() || undefined,
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName) || a.compid - b.compid), [companies]);

  const selectedCompanyIds = useMemo(() => new Set(value.companies.map(Number)), [value.companies]);
  const selectedCompanies = companyOptions.filter((c) => selectedCompanyIds.has(c.compid));
  const selectedKeys = useMemo(() => new Set(value.units.map((u) => `${u.compid}:${u.unitcode}`)), [value.units]);

  const filteredCompanies = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    if (!q) return companyOptions;
    return companyOptions.filter((c) => `${c.companyName} ${c.orgCode}`.toLowerCase().includes(q));
  }, [companyOptions, orgSearch]);

  const unitsForCompany = (compid: number) => units
    .filter((u) => Number(u.compcode) === compid)
    .map((u) => ({
      compid: Number(u.compcode),
      unitcode: String(u.unitcode),
      name: u.Unitname?.trim() || `Client ${u.unitcode}`,
      location: [u.city, u.state].filter(Boolean).join(", "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.unitcode.localeCompare(b.unitcode));

  const toggleCompany = (compid: number, checked: boolean) => {
    if (checked) {
      const companies = Array.from(new Set([...value.companies.map(Number), compid]));
      onChange({ ...value, companies });
      return;
    }
    onChange({
      companies: value.companies.filter((id) => Number(id) !== compid),
      branches: value.branches.filter((b) => Number(b.compid) !== compid),
      clients: value.clients.filter((c) => Number(c.compid) !== compid),
      units: value.units.filter((u) => Number(u.compid) !== compid),
    });
  };

  const toggleClient = (compid: number, unitcode: string, checked: boolean) => {
    const without = value.units.filter((u) => !(Number(u.compid) === compid && String(u.unitcode) === unitcode));
    const nextUnits = checked ? [...without, { compid, unitcode }] : without;
    const companies = selectedCompanyIds.has(compid)
      ? value.companies
      : Array.from(new Set([...value.companies.map(Number), compid]));
    onChange({ ...value, companies, units: nextUnits });
  };

  if (isLoadingCompanies || isLoadingUnits) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading Organizations and Clients…</div>;
  }
  if (isCompaniesError || isUnitsError) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50/50 px-3 py-2 text-[11px] text-blue-800">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-600" />
        <span>Select one or more Organizations, then choose the Client(s) this {roleLabel} can access under each Organization.</span>
      </div>

      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-muted-foreground">Organization(s)</div>
        <Popover open={orgOpen} onOpenChange={setOrgOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full h-9 justify-between text-xs font-normal">
              <span className="truncate text-left">
                {selectedCompanies.length === 0 ? "Select Organization(s)…" : selectedCompanies.length === 1 ? selectedCompanies[0].displayLabel ?? selectedCompanies[0].orgCode ? `${selectedCompanies[0].companyName} — ${selectedCompanies[0].orgCode}` : selectedCompanies[0].companyName : `${selectedCompanies.length} Organizations selected`}
              </span>
              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[500px] max-w-[92vw] p-0" align="start">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={orgSearch} onChange={(e) => setOrgSearch(e.target.value)} className="h-8 pl-8 text-xs" placeholder="Search Organization name or code…" />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filteredCompanies.map((company) => {
                const checked = selectedCompanyIds.has(company.compid);
                return (
                  <label key={company.compid} className="flex items-start gap-2 rounded px-2 py-2 hover:bg-muted cursor-pointer">
                    <Checkbox checked={checked} onCheckedChange={(v) => toggleCompany(company.compid, v === true)} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{company.displayLabel ?? company.orgCode ? `${company.companyName} — ${company.orgCode}` : company.companyName}</div>
                      <div className="text-[10px] text-muted-foreground">Organization ID {company.compid}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {selectedCompanies.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Select at least one Organization to assign Clients.</p>
      ) : (
        <div className="space-y-2">
          {selectedCompanies.map((company) => {
            const options = unitsForCompany(company.compid);
            const q = (clientSearch[company.compid] ?? "").trim().toLowerCase();
            const filtered = q
              ? options.filter((c) => `${c.unitcode} ${c.name} ${c.location}`.toLowerCase().includes(q))
              : options;
            const selectedForCompany = options.filter((c) => selectedKeys.has(`${c.compid}:${c.unitcode}`));

            return (
              <div key={company.compid} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{company.displayLabel ?? company.orgCode ? `${company.companyName} — ${company.orgCode}` : company.companyName}</div>
                    <div className="text-[10px] text-muted-foreground">{selectedForCompany.length} Client{selectedForCompany.length === 1 ? "" : "s"} selected</div>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleCompany(company.compid, false)} title="Remove Organization">
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <Popover open={clientOpenFor === company.compid} onOpenChange={(open) => setClientOpenFor(open ? company.compid : null)}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full h-9 justify-between text-xs font-normal">
                      <span className="truncate text-left">
                        {selectedForCompany.length === 0 ? "Select Client(s)…" : selectedForCompany.length === 1 ? `${selectedForCompany[0].unitcode} — ${selectedForCompany[0].name}` : `${selectedForCompany.length} Clients selected`}
                      </span>
                      <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[500px] max-w-[92vw] p-0" align="start">
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          value={clientSearch[company.compid] ?? ""}
                          onChange={(e) => setClientSearch((s) => ({ ...s, [company.compid]: e.target.value }))}
                          className="h-8 pl-8 text-xs"
                          placeholder="Search Client ID / Code or Client Name…"
                        />
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                      {filtered.length === 0 ? (
                        <p className="px-3 py-4 text-xs text-muted-foreground text-center">No Clients found for this Organization.</p>
                      ) : filtered.map((client) => {
                        const key = `${client.compid}:${client.unitcode}`;
                        const checked = selectedKeys.has(key);
                        return (
                          <label key={key} className="flex items-start gap-2 rounded px-2 py-2 hover:bg-muted cursor-pointer">
                            <Checkbox checked={checked} onCheckedChange={(v) => toggleClient(client.compid, client.unitcode, v === true)} className="mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-xs font-medium"><span className="font-mono shrink-0">{client.unitcode}</span><span className="truncate">— {client.name}</span>{checked && <Check className="h-3.5 w-3.5 text-emerald-600" />}</div>
                              {client.location && <div className="text-[10px] text-muted-foreground">{client.location}</div>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
