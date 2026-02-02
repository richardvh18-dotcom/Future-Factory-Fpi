import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

/**
 * i18n Configuratie: Beheert alle vertalingen voor de site.
 * Locatie: src/i18n.js
 */
const resources = {
  nl: {
    translation: {
      common: {
        welcome: "Welkom",
        employee: "Medewerker",
        loading: "Laden...",
        search: "Zoeken",
        error: "Fout",
        success: "Succes",
        cancel: "Annuleren",
        confirm: "Bevestigen",
      },
      login: {
        title_main: "Future",
        title_sub: "Factory",
        subtitle: "Industrial MES Portal",
        email_label: "E-mailadres",
        email_placeholder: "naam@futurepipe.com",
        password_label: "Wachtwoord",
        password_placeholder: "••••••••",
        submit: "Systeem Inloggen",
        request_account: "Account Aanvragen",
        error_auth: "Systeemfout of ongeldige inloggegevens.",
        emergency_title: "EMERGENCY MODE",
        emergency_desc: "God Mode bypass geactiveerd! Dit is een noodtoegang.",
      },
      portal: {
        welcome_sub: "Kies uw werkomgeving",
        tiles: {
          catalog: {
            title: "Catalogus",
            desc: "Zoek productspecificaties en tekeningen.",
            action: "Openen",
          },
          planning: {
            title: "Planning & MES",
            desc: "Digitale planning en voortgangscontrole.",
            action: "Openen",
          },
          messages: {
            title: "Berichten",
            desc: "Interne communicatie en updates.",
            action: "Openen",
            badge_new: "Nieuw",
          },
          admin: {
            title: "Beheerpaneel",
            desc: "Systeeminstellingen en logboeken.",
            action: "Beheren",
          },
          inventory: {
            title: "Gereedschap",
            desc: "Beheer matrijzen en voorraad.",
            action: "Bekijken",
          },
          assistant: {
            title: "AI Training",
            desc: "Train de assistent en bekijk Flashcards.",
            action: "Starten",
          },
        },
      },
      header: {
        branding_sub: "Industrial MES Core",
        search_placeholder: "Zoek in het systeem (Orders, Producten...)",
        system_status: "FPi Secure Node",
      },
      sidebar: {
        nav: {
          common: {
            portal: "Portaal",
            planning: "Planning",
            catalog: "Catalogus",
            inventory: "Gereedschap",
            ai_training: "AI Training",
            calculator: "Calculator",
            messages: "Berichten",
            admin: "Beheer",
            profile: "Profiel",
            logout: "Uitloggen",
          },
        },
        filters: "Filters",
        filters_show: "Filters Tonen",
        filters_hide: "Filters Verbergen",
      },
      profile: {
        title: "Profiel & Instellingen",
        tabs: {
          general: "Algemeen",
          security: "Beveiliging",
        },
        labels: {
          name: "Weergavenaam",
          email: "E-mailadres",
          role: "Functie / Afdeling",
          phone: "Telefoonnummer (Optioneel)",
        },
        prefs: {
          title: "Systeem Voorkeuren",
          notifications: "E-mail Notificaties",
          alerts: "Systeem Alerts",
          darkmode: "Donkere Modus",
          language: "Taal / Language",
          lang_nl: "Nederlands",
          lang_en: "English",
        },
        security: {
          title: "Wachtwoord Wijzigen",
          new_pass: "Nieuw Wachtwoord",
          confirm_pass: "Bevestig Wachtwoord",
          update_btn: "Wachtwoord Updaten",
        },
        save_btn: "Wijzigingen Opslaan",
        success_msg: "Profiel succesvol bijgewerkt.",
      },
      tabs: {
        products: "Catalogus",
        ai: "AI Assistent",
        calculator: "Calculator",
        admin_dashboard: "Beheer",
        admin_logs: "Systeem Logs",
        admin_upload: "Bulk Import",
      },
      buttons: {
        close: "Venster Sluiten",
        logout: "Uitloggen",
        pdf: "Download PDF",
        qc: "QC Certificaat",
        save: "Opslaan",
        delete: "Verwijderen",
        edit: "Bewerken",
        add: "Nieuwe Toevoegen",
      },
      product: {
        details: "Specificaties",
        type: "Product Type",
        no_img: "Geen tekening beschikbaar",
        angle: "Hoek",
        radius: "Radius",
        boring: "Boorpatroon",
        article_code: "Artikelnummer",
        dims: "Fitting Afmetingen",
        bell_dims: "Mof Afmetingen",
        doc_source: "Documentatie & Tekeningen",
      },
      tools: {
        title: "Gereedschappen Overzicht",
        col_part: "Matrijs / Onderdeel",
        col_loc: "Locatie",
        none_defined: "Geen matrijzen gekoppeld aan dit product.",
      },
      planning: {
        hub: {
          title_main: "Productie",
          title_sub: "Hub",
          subtitle: "Industrial Operations Center",
          error_title: "Systeemfout in Planning",
          error_desc: "De module kon niet correct worden geladen.",
          error_recovery: "Herstellen",
          back_to_portal: "Terug naar Portal"
        },
        departments: {
          fittings_title: "Fitting Productions",
          fittings_desc: "Hulpstukken & Voorbewerking",
          pipes_title: "Pipe Productions",
          pipes_desc: "Leidingwerk & Lamineren",
          spools_title: "Spools Productions",
          spools_desc: "Assemblage & Prefab",
          planner_title: "Central Planner",
          planner_desc: "Werkvoorbereiding & Planning"
        }
      },
      admin: {
        dashboard: {
          title_main: "Admin",
          title_sub: "Hub",
          subtitle: "Control Center & Technical Reference",
          active_session: "Actieve Sessie",
          syncing: "Hub Synchroniseren...",
          root_synced: "Root Gesynchroniseerd",
          open_module: "Openen",
          footer: "Future Factory MES Core v6.11"
        },
        menu: {
          roadmap_title: "Master Roadmap",
          roadmap_desc: "Volg de ontwikkelings-roadmap en dien ideeën in.",
          products_title: "Product Manager",
          products_desc: "Beheer de technische catalogus en verificatie-status.",
          matrix_title: "Matrix Manager",
          matrix_desc: "Beheer technische logica, mof-maten en toleranties.",
          reference_table_title: "Technische Encyclopedie",
          reference_table_desc: "Read-only opzoeken van stamdata (Boringen, Mof-maten).",
          factory_title: "Fabrieksstructuur",
          factory_desc: "Inrichting van afdelingen, machines en terminals.",
          personnel_title: "Personeel & Bezetting",
          personnel_desc: "Database van operators en actuele machine-bezetting.",
          conversions_title: "Conversie Matrix",
          conversions_desc: "Koppeling tussen Infor-LN codes en technische tekeningen.",
          logs_title: "Activiteiten Logboek",
          logs_desc: "Systeem-audit trail en real-time monitoring van acties.",
          labels_title: "Label Architect",
          labels_desc: "Ontwerp en beheer labels voor de Zebra printers.",
          ai_training_title: "AI Training & QA",
          ai_training_desc: "Kwaliteitscontrole van AI antwoorden en kennisbank.",
          messages_title: "Berichten Hub",
          messages_desc: "Beheer interne communicatie en systeem-notificaties.",
          users_title: "Gebruikers & Rollen",
          users_desc: "Beheer systeem-accounts en toegangsrechten.",
          settings_title: "Systeem Instellingen",
          settings_desc: "Globale applicatie-configuratie en root-bescherming.",
          migration_title: "Data Migratie",
          migration_desc: "Legacy data importeren uit /artifacts/ mappen.",
          database_title: "Database Explorer",
          database_desc: "Directe inspectie van paden en data-integriteit."
        }
      }
    },
  },
  en: {
    translation: {
      common: {
        welcome: "Welcome",
        employee: "Employee",
        loading: "Loading...",
        search: "Search",
        error: "Error",
        success: "Success",
        cancel: "Cancel",
        confirm: "Confirm",
      },
      login: {
        title_main: "Future",
        title_sub: "Factory",
        subtitle: "Industrial MES Portal",
        email_label: "Email Address",
        email_placeholder: "name@futurepipe.com",
        password_label: "Password",
        password_placeholder: "••••••••",
        submit: "System Login",
        request_account: "Request Account",
        error_auth: "System error or invalid credentials.",
        emergency_title: "EMERGENCY MODE",
        emergency_desc: "God Mode bypass activated! This is emergency access.",
      },
      portal: {
        welcome_sub: "Select your workspace",
        tiles: {
          catalog: {
            title: "Catalog",
            desc: "Search product specifications and drawings.",
            action: "Open",
          },
          planning: {
            title: "Planning & MES",
            desc: "Digital planning and progress tracking.",
            action: "Open",
          },
          messages: {
            title: "Messages",
            desc: "Internal implementation and updates.",
            action: "Open",
            badge_new: "New",
          },
          admin: {
            title: "Admin Panel",
            desc: "System settings and logs.",
            action: "Manage",
          },
          inventory: {
            title: "Inventory",
            desc: "Manage molds and stock.",
            action: "View",
          },
          assistant: {
            title: "AI Training",
            desc: "Train the assistant and view Flashcards.",
            action: "Start",
          },
        },
      },
      header: {
        branding_sub: "Industrial MES Core",
        search_placeholder: "Search in system (Orders, Products...)",
        system_status: "FPi Secure Node",
      },
      sidebar: {
        nav: {
          common: {
            portal: "Portal",
            planning: "Planning",
            catalog: "Catalog",
            inventory: "Inventory",
            ai_training: "AI Training",
            calculator: "Calculator",
            messages: "Messages",
            admin: "Admin",
            profile: "Profile",
            logout: "Logout",
          },
        },
        filters: "Filters",
        filters_show: "Show Filters",
        filters_hide: "Hide Filters",
      },
      profile: {
        title: "Profile & Settings",
        tabs: {
          general: "General",
          security: "Security",
        },
        labels: {
          name: "Display Name",
          email: "Email Address",
          role: "Role / Department",
          phone: "Phone Number (Optional)",
        },
        prefs: {
          title: "System Preferences",
          notifications: "Email Notifications",
          alerts: "System Alerts",
          darkmode: "Dark Mode",
          language: "Language",
          lang_nl: "Nederlands",
          lang_en: "English",
        },
        security: {
          title: "Change Password",
          new_pass: "New Password",
          confirm_pass: "Confirm Password",
          update_btn: "Update Password",
        },
        save_btn: "Save Changes",
        success_msg: "Profile successfully updated.",
      },
      tabs: {
        products: "Catalog",
        ai: "AI Assistant",
        calculator: "Calculator",
        admin_dashboard: "Admin Console",
        admin_logs: "System Logs",
        admin_upload: "Bulk Upload",
      },
      buttons: {
        close: "Close Window",
        logout: "Log Out",
        pdf: "Download PDF",
        qc: "QC Certificate",
        save: "Save Changes",
        delete: "Remove",
        edit: "Modify",
        add: "Add New Item",
      },
      product: {
        details: "Technical Specs",
        type: "Type",
        no_img: "No image found",
        boring: "Drilling",
        dims: "Fitting Dimensions",
        bell_dims: "Bell Dimensions",
        doc_source: "Documentation & Drawings",
      },
      tools: {
        title: "Tooling Overview",
        col_part: "Mold / Part",
        col_loc: "Location",
        none_defined: "No molds linked to this product.",
      },
      planning: {
        hub: {
          title_main: "Production",
          title_sub: "Hub",
          subtitle: "Industrial Operations Center",
          error_title: "System Error in Planning",
          error_desc: "The module could not be loaded correctly.",
          error_recovery: "Recover",
          back_to_portal: "Back to Portal"
        },
        departments: {
          fittings_title: "Fitting Productions",
          fittings_desc: "Fittings & Preparation",
          pipes_title: "Pipe Productions",
          pipes_desc: "Piping & Lamination",
          spools_title: "Spools Productions",
          spools_desc: "Assembly & Prefab",
          planner_title: "Central Planner",
          planner_desc: "Work Preparation & Planning"
        }
      },
      admin: {
        dashboard: {
          title_main: "Admin",
          title_sub: "Hub",
          subtitle: "Control Center & Technical Reference",
          active_session: "Active Session",
          syncing: "Syncing Hub...",
          root_synced: "Root Synchronized",
          open_module: "Launch",
          footer: "Future Factory MES Core v6.11"
        },
        menu: {
          roadmap_title: "Master Roadmap",
          roadmap_desc: "Track development roadmap and submit ideas.",
          products_title: "Product Manager",
          products_desc: "Manage technical catalog and verification status.",
          matrix_title: "Matrix Manager",
          matrix_desc: "Manage technical logic, socket dimensions, and tolerances.",
          reference_table_title: "Technical Encyclopedia",
          reference_table_desc: "Read-only lookup of master data (Bore, Socket Dimensions).",
          factory_title: "Factory Structure",
          factory_desc: "Setup departments, machines, and terminals.",
          personnel_title: "Personnel & Occupancy",
          personnel_desc: "Operator database and current machine occupancy.",
          conversions_title: "Conversion Matrix",
          conversions_desc: "Link between Infor-LN codes and technical drawings.",
          logs_title: "Activity Log",
          logs_desc: "System audit trail and real-time activity monitoring.",
          labels_title: "Label Architect",
          labels_desc: "Design and manage labels for Zebra printers.",
          ai_training_title: "AI Training & QA",
          ai_training_desc: "Quality control of AI responses and knowledge base.",
          messages_title: "Messages Hub",
          messages_desc: "Manage internal communication and system notifications.",
          users_title: "Users & Roles",
          users_desc: "Manage system accounts and access rights.",
          settings_title: "System Settings",
          settings_desc: "Global application configuration and root protection.",
          migration_title: "Data Migration",
          migration_desc: "Import legacy data from /artifacts/ folders.",
          database_title: "Database Explorer",
          database_desc: "Direct inspection of paths and data integrity."
        }
      }
    },
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "nl",
    interpolation: {
      escapeValue: false, // React doet dit al zelf
    },
  });

export default i18n;
