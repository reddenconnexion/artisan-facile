import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import Clients from './Clients';

const ClientsHub = () => {
    const [searchParams] = useSearchParams();

    // Les chantiers ont leur propre section de premier niveau (/app/chantiers).
    // On redirige les anciens liens `/app/clients?view=worksites` pour ne pas
    // casser les favoris existants.
    if (searchParams.get('view') === 'worksites') {
        return <Navigate to="/app/chantiers" replace />;
    }

    return <Clients />;
};

export default ClientsHub;
