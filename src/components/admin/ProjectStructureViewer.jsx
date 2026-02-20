import React from "react";

/**
 * ProjectStructureViewer
 * Visueel overzicht van de volledige sitestructuur en modules.
 */
const ProjectStructureViewer = () => {
  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Projectstructuur & Uitleg</h1>
      <p style={{ maxWidth: 700, marginBottom: 24 }}>
        Dit overzicht toont de belangrijkste mappen, modules en componenten van het platform. Gebruik dit als naslag voor nieuwe ontwikkelaars of bij onboarding.
      </p>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 24 }}>Visuele structuur</h2>
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, margin: '16px 0', overflowX: 'auto' }}>
        {/* Mermaid-diagram als SVG of image embedden, of als codeblock tonen */}
        <pre style={{ fontSize: 13, lineHeight: 1.5 }}>
{`
Root
├── src
│   ├── components
│   │   ├── admin
│   │   │   ├── AdminDashboard.jsx
│   │   │   ├── ...
│   │   ├── digitalplanning
│   │   │   ├── EfficiencyDashboard.jsx
│   │   │   ├── ...
│   │   ├── notifications
│   │   │   └── ToastContainer.jsx
│   │   ├── products
│   │   ├── personnel
│   │   ├── planning
│   │   ├── ai
│   │   ├── teamleader
│   │   ├── debug
│   │   └── ...losse componenten
│   ├── contexts
│   ├── hooks
│   ├── config
│   ├── utils
│   ├── data
│   └── services
├── public
│   └── firebase-messaging-sw.js
├── README.md, SECURITY.md, ROADMAP.md, ...
`}
        </pre>
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32 }}>Hoofdmodules & uitleg</h2>
      <ul style={{ maxWidth: 700, fontSize: 16, lineHeight: 1.7 }}>
        <li><b>src/components/admin/</b>: Beheermodules (producten, gebruikers, labels, efficiency, etc.)</li>
        <li><b>src/components/digitalplanning/</b>: Planning, efficiency, mobiele tools</li>
        <li><b>src/components/notifications/</b>: Notificatie UI</li>
        <li><b>src/components/products/</b>: Productbeheer en zoekfuncties</li>
        <li><b>src/components/personnel/</b>: Personeelsbeheer</li>
        <li><b>src/components/planning/</b>: Geavanceerde planningsmodules</li>
        <li><b>src/components/ai/</b>: AI-tools en training</li>
        <li><b>src/components/teamleader/</b>: Teamleider dashboards</li>
        <li><b>src/components/debug/</b>: Debugging tools</li>
        <li><b>src/contexts/</b>: Context providers (o.a. notificaties)</li>
        <li><b>src/hooks/</b>: Custom React hooks</li>
        <li><b>src/config/</b>: Firebase setup, database paths</li>
        <li><b>src/utils/</b>: Helperfuncties, efficiency berekeningen</li>
        <li><b>public/</b>: Service workers, manifest, statische assets</li>
      </ul>
      <h2 style={{ fontSize: 22, fontWeight: 600, marginTop: 32 }}>Meer details?</h2>
      <p style={{ maxWidth: 700 }}>
        Bekijk de code of vraag een specifiek onderdeel uitgelicht!<br/>
        <span style={{ color: '#64748b', fontSize: 14 }}>
          (Deze pagina is bedoeld als visuele en tekstuele gids voor developers)
        </span>
      </p>
    </div>
  );
};

export default ProjectStructureViewer;
