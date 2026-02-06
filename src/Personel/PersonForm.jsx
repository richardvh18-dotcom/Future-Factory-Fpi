import React, { useState, useEffect } from "react";

const emptyPerson = {
  name: "",
  email: "",
  department: "",
  role: "",
  // ...andere velden...
};

const PersonForm = ({ person, onSave }) => {
  const [formData, setFormData] = useState(emptyPerson);

  useEffect(() => {
    if (person) {
      setFormData(person);
    } else {
      setFormData(emptyPerson);
    }
  }, [person]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSave) onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="person-form">
      <div>
        <label>Naam:</label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
        />
      </div>
      <div>
        <label>Email:</label>
        <input
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
        />
      </div>
      <div>
        <label>Afdeling:</label>
        <input
          type="text"
          name="department"
          value={formData.department}
          onChange={handleChange}
        />
      </div>
      <div>
        <label>Rol:</label>
        <input
          type="text"
          name="role"
          value={formData.role}
          onChange={handleChange}
        />
      </div>
      {/* Voeg meer velden toe indien nodig */}
      <button type="submit">Opslaan</button>
    </form>
  );
};

export default PersonForm;
