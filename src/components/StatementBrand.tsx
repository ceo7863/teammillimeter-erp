import type { CompanyProfile } from "@/utils/companyProfile";
import {
  DEFAULT_COMPANY_PROFILE,
  companyProfileContactLines,
  companyProfileLinkItems,
} from "@/utils/companyProfile";

const LOGO_SRC = "/team-mm-logo.png";

function resolveProfile(companyProfile?: CompanyProfile) {
  return companyProfile || DEFAULT_COMPANY_PROFILE;
}

export function StatementSheetHeader({
  title,
  companyProfile,
}: {
  title: string;
  companyProfile?: CompanyProfile;
}) {
  const profile = resolveProfile(companyProfile);
  const links = companyProfileLinkItems(profile);

  return (
    <header className="excel-sheet-header">
      <div className="excel-sheet-company">
        <div className="excel-sheet-company-name">{profile.name || DEFAULT_COMPANY_PROFILE.name}</div>
        {profile.businessNo ? (
          <div className="excel-sheet-company-line">{"\uC0AC\uC5C5\uC790\uBC88\uD638 "}{profile.businessNo}</div>
        ) : null}
        {profile.phone ? <div className="excel-sheet-company-line">Tel {profile.phone}</div> : null}
        {profile.fax ? <div className="excel-sheet-company-line">Fax {profile.fax}</div> : null}
        {profile.address ? <div className="excel-sheet-company-line excel-sheet-company-address">{profile.address}</div> : null}
        {links.length > 0 ? (
          <div className="excel-sheet-company-links">
            {links.map((item) => (
              <span key={item.label} className="excel-sheet-company-link">
                {item.label}: {item.href.replace(/^https?:\/\//i, "")}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <img src={LOGO_SRC} alt="TEAM mm" className="excel-sheet-logo" />
      <h1 className="excel-sheet-title">{title}</h1>
    </header>
  );
}

export function StatementSheetFooter({ companyProfile }: { companyProfile?: CompanyProfile }) {
  const profile = resolveProfile(companyProfile);
  const contactLines = companyProfileContactLines(profile);
  const links = companyProfileLinkItems(profile);

  return (
    <div className="excel-footer-brand">
      <img src={LOGO_SRC} alt="TEAM mm" className="excel-footer-logo" />
      <div className="excel-footer-company">
        {contactLines.map((line) => (
          <div key={line} className="excel-footer-company-line">
            {line}
          </div>
        ))}
        {links.length > 0 ? (
          <div className="excel-footer-company-links">
            {links.map((item) => (
              <span key={item.label} className="excel-footer-company-link">
                {item.label}: {item.href.replace(/^https?:\/\//i, "")}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
