import React, { useMemo } from 'react';

/**
 * ProductMoveModal
 * 
 * Een slimme modal voor het verplaatsen van producten.
 * Toont stations binnen de huidige afdeling én Inboxes van andere afdelingen.
 */
const ProductMoveModal = ({ 
  isOpen, 
  onClose, 
  onMove, 
  currentDepartment, 
  allStations = [] 
}) => {
  if (!isOpen) return null;

  const destinations = useMemo(() => {
    // Definieer de Inboxes die altijd beschikbaar moeten zijn als bestemming
    // (behalve als je er al bent, dat filteren we hieronder)
    const targetInboxes = [
      { id: 'FITTINGS_INBOX', name: '📥 Fittings Inbox', department: 'Fittings' },
      { id: 'PIPES_INBOX', name: '📥 Pipes Inbox', department: 'Pipes' },
      { id: 'SPOOLS_INBOX', name: '📥 Spools Inbox', department: 'Spools' }
    ];

    // 1. Filter stations van de huidige afdeling (exclusief inboxes om dubbelingen te voorkomen)
    const localStations = allStations.filter(s => 
      (s.department === currentDepartment || !s.department) && !s.id.includes('_INBOX')
    );

    // 2. Voeg Inboxes van ANDERE afdelingen toe
    // (Zodat je vanuit Fittings iets naar Spools kunt sturen)
    const externalInboxes = targetInboxes.filter(inbox => inbox.department !== currentDepartment);

    // 3. Samenvoegen en alfabetisch sorteren op naam
    const options = [...localStations, ...externalInboxes];
    
    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [allStations, currentDepartment]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">
            Product Verplaatsen
          </h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500 focus:outline-none transition-colors"
          >
            <span className="text-2xl leading-none">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-gray-500 mb-4">
            Selecteer de nieuwe locatie. Je ziet stations binnen <strong>{currentDepartment}</strong> en inboxes van andere afdelingen.
          </p>

          <div className="grid grid-cols-1 gap-2 max-h-[60vh] overflow-y-auto pr-2">
            {destinations.map((station) => (
              <button
                key={station.id}
                onClick={() => onMove(station.id)}
                className="flex items-center justify-between w-full px-4 py-3 text-left border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-all group"
              >
                <span className="font-medium text-gray-700 group-hover:text-blue-700">
                  {station.name}
                </span>
                {station.id.includes('INBOX') && (
                  <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    {station.department}
                  </span>
                )}
              </button>
            ))}

            {destinations.length === 0 && (
              <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                Geen beschikbare locaties gevonden.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductMoveModal;