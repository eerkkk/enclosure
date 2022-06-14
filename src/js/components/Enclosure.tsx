import * as React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Leaderboards from './Leaderboards';
import MapComponent from './MapComponent';
import Navbar from './Navbar';

const Enclosure: React.FC = (): JSX.Element => {
	return (
		<div id='enclosure-container'>
			<Navbar />

			<div className="container">
				<Routes>
					<Route path='game' element={ <MapComponent /> } />
					<Route path='leaderboards' element={ <Leaderboards /> } />
					<Route path="*" element={ <Navigate replace to={ '/game' } /> } />
				</Routes>
			</div>
		</div>
	);
};

export default Enclosure;