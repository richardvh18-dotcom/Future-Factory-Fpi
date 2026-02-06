import React, { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, isValidPath } from "../config/dbPaths";
import PersonList from "./PersonList";
import PersonForm from "./PersonForm";
import DepartmentTree from "./DepartmentTree";
import OccupancyTable from "./OccupancyTable";

const PersonnelManager = () => {
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingPerson, setEditingPerson] = useState(null);

  useEffect(() => {
    if (!isValidPath("PERSONNEL")) return;
    const unsub = onSnapshot(
      query(collection(db, ...PATHS.PERSONNEL), orderBy("name")),
      (snap) => {
        setPersonnel(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  if (loading) return <div>Laden...</div>;

  return (
    <div>
      <h2 className="text-xl font-black mb-4">Personeelsbeheer</h2>
      <PersonList
        personnel={personnel}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onEdit={setEditingPerson}
      />
      <div className="mt-6">
        <PersonForm
          person={editingPerson}
          onSave={() => setEditingPerson(null)}
        />
      </div>
      <div className="mt-6">
        <DepartmentTree />
      </div>
      <div className="mt-6">
        <OccupancyTable />
      </div>
    </div>
  );
};

export default PersonnelManager;
