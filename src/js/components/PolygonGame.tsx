/* eslint-disable no-console */
import * as turf from '@turf/turf';
import * as React from 'react';
import { LngLatLike, Popup, useMap } from 'react-map-gl';
import { useNavigate, useParams } from 'react-router-dom';

import { MULTI_POLYGON_EUROPEAN_COUNTRIES } from '../constants/MULTI_POLYGON_EUROPEAN_COUNTRIES';
import { MULTI_POLYGON_SOUTH_AMERICAN_COUNTRIES } from '../constants/MULTI_POLYGON_SOUTH_AMERICAN_COUNTRIES';
import { MULTI_POLYGON_STATES } from '../constants/MULTI_POLYGON_STATES';
import { SINGLE_POLYGON_SOUTH_AMERICAN_COUNTRIES } from '../constants/SINGLE_POLYGON_SOUTH_AMERICAN_COUNTRIES';
import { SINGLE_POLYGON_STATES } from '../constants/SINGLE_POLYGON_STATES';
import { initializePolygons, randomUniqueIndices } from '../lib/util';

import DrawingTools, { drawRef }  from './DrawingTools';

import 'mapbox-gl/dist/mapbox-gl.css';

const maximumScore = 100;
let gameContentPolygons = [];
let tooltipTimeout;

// TODO: Move to lib
const determineClueCount = (content: string, gameId: string) => {
	if (content === 'europe') {
		switch (gameId) {
			case 'easy':
				return 7;
			case 'medium':
				return 4;
			case 'hard':
				return 2;
			default:
				return 4;
		}
	}

	if (content === 'south-america') {
		switch (gameId) {
			case 'easy':
				return 3;
			case 'medium':
				return 2;
			case 'hard':
				return 1;
			default:
				return 2;
		}
	}

	switch (gameId) {
		case 'easy':
			return 8;
		case 'medium':
			return 5;
		case 'hard':
			return 3;
		default:
			return 5;
	}
};

const determineGameContentPolygons = (content: string) => {
	let gameContentPolygons = [];

	if (content === 'us-states') {
		gameContentPolygons = initializePolygons(SINGLE_POLYGON_STATES, MULTI_POLYGON_STATES);
	}
	else if (content === 'europe') {
		gameContentPolygons = initializePolygons([], MULTI_POLYGON_EUROPEAN_COUNTRIES);
	}
	else if (content === 'south-america') {
		gameContentPolygons = initializePolygons(SINGLE_POLYGON_SOUTH_AMERICAN_COUNTRIES, MULTI_POLYGON_SOUTH_AMERICAN_COUNTRIES);
	}

	return gameContentPolygons;
};

const determineTotalTargetCount = (content: string, gameId: string) => {
	if (!(gameId === 'easy' || gameId === 'medium' || gameId === 'hard')) {
		return gameId;
	}

	if (content === 'us-states') {
		return 50;
	}

	if (content === 'europe') {
		return 38;
	}

	if (content === 'south-america') {
		return 13;
	}
};

const PolygonGame: React.FC<{ clueMode?: boolean }> = ({ clueMode = false }): JSX.Element => {
	const [ finalScore, setFinalScore ] = React.useState(-1);
	const [ totalFinalScore, setTotalFinalScore ] = React.useState(0);
	const [ didGameEnd, setDidGameEnd ] = React.useState(false);
	const [ showResults, setShowResults ] = React.useState(false);
	const [ isDrawing, setIsDrawing ] = React.useState(false);
	const [ polygons, setPolygons ] = React.useState({});
	const [ targetCount, setTargetCount ] = React.useState(1);
	const [ targetState, setTargetState ] = React.useState('');
	const [ targetPolygon, setTargetPolygon ] = React.useState();
	const [ userPolygon, setUserPolygon ] = React.useState();
	const [ cluePolygons, setCluePolygons ] = React.useState([]);
	const [ pastPolygons, setPastPolygons ] = React.useState([]);
	const [ showTooltip, setShowTooltip ] = React.useState(false);
	const [ polygonTooltip, setPolygonTooltip ] = React.useState({
		coordinates: [],
		tooltipText: ''
	});
	const { mapbox } = useMap();
	const navigate = useNavigate();
	const { content, id: gameId } = useParams();
	const totalTargetCount = determineTotalTargetCount(content, gameId);
	const defaultClueCount = determineClueCount(content, gameId);

	const incrementTargetCount = () => setTargetCount(targetCount + 1);
	const incrementTotalFinalScore = (finalScore) => setTotalFinalScore(totalFinalScore + Number(finalScore));

	const addPastPolygon = (pastPolygon: any) => {
		setPastPolygons((array) => [ ...array, pastPolygon ]);
	};

	const determineResults = () => {
		const intersection: any = userPolygon && turf.intersect(userPolygon, targetPolygon);
		const pastPolygon: { difference: any; intersection: any; name: string; polygon: any } = { difference: null, intersection, name: targetState, polygon: targetPolygon };

		flyToTargetDestination(targetPolygon);

		if (intersection === null) {
			const deadWrong: any = targetPolygon;

			deadWrong.properties = { class_id: 2 };
			drawRef?.deleteAll().add(deadWrong);
			setFinalScore(0);
			setIsDrawing(false);
		}

		if (intersection) {
			const outlierArea = turf.difference(userPolygon, intersection);

			outlierArea.properties = { class_id: 3 };

			drawRef?.deleteAll().add(outlierArea);

			intersection.properties = { class_id: 1 };
			drawRef?.add(intersection);

			// TODO: Move to lib
			const intersectionArea = turf.convertArea(turf.area(intersection), 'meters', 'miles');
			const targetArea = turf.convertArea(turf.area(targetPolygon), 'meters', 'miles');
			const drawnArea = turf.convertArea(turf.area(userPolygon), 'meters', 'miles');
			const baseMultiplier = intersectionArea / targetArea;
			const drawAccuracy = 1 - ((drawnArea - intersectionArea) / drawnArea);
			// Penalty multiplier for draw accuracy is less forgiving if you overshoot more than 5 percent of target area
			const penaltyMultiplier = drawnArea > (targetArea * 1.25) ? drawAccuracy * 0.85 : drawAccuracy;
			const finalScore = maximumScore * baseMultiplier * penaltyMultiplier;

			setFinalScore(Number(finalScore.toFixed(0)));
			incrementTotalFinalScore(Number(finalScore.toFixed(0)));

			// TODO: Add these to the score sheet
			console.log('base multiplier:', baseMultiplier.toFixed(2));
			console.log('penalty multiplier:', penaltyMultiplier.toFixed(2));

			const difference = turf.difference(targetPolygon, intersection);

			if (difference) {
				difference.properties = { class_id: 2 };
				drawRef?.add(difference);
				pastPolygon.difference = difference;
			}
		}

		addPastPolygon(pastPolygon);
	};

	const displayCluePolygons = () => {
		if (cluePolygons && Object.keys(cluePolygons).length > 0) {
			const cluePolygonsLength = Object.keys(cluePolygons).length;

			for (let i = 0; i < cluePolygonsLength; i++) {
				const { data: polygonData, name: polygonName } = cluePolygons[ i ];

				polygonData.properties = { class_id: 'clue', polygon_name: polygonName };
				drawRef?.add(polygonData);
			}
		}
	};

	const displayPastPolygons = () => {
		if (pastPolygons && Object.keys(pastPolygons).length > 0) {
			const pastPolygonsLength = Object.keys(pastPolygons).length;

			for (let i = 0; i < pastPolygonsLength; i++) {
				const { difference, intersection, name, polygon } = pastPolygons[ i ];

				if (intersection === null) {
					polygon.properties = { class_id: 2, polygon_name: name };
					drawRef?.add(polygon);
					continue;
				}

				if (difference) {
					difference.properties = { class_id: 2, polygon_name: name };
					intersection.properties = { class_id: 1, polygon_name: name };
					drawRef?.add(difference);
					drawRef?.add(intersection);
				}
				else {
					polygon.properties = { class_id: 1, polygon_name: name };
					drawRef?.add(polygon);
				}
			}
		}
	};

	const onDrawDelete = React.useCallback((draw) => {
		setPolygons((currentFeatures) => {
			const newFeatures = { ...currentFeatures };

			for (const feature of draw.features) {
				delete newFeatures[ feature.id ];
			}

			return newFeatures;
		});
	}, [ ]);

	const onDrawStart = () => {
		drawRef?.changeMode('draw_polygon');
		setIsDrawing(true);
	};

	const onDrawUpdate = React.useCallback((draw) => {
		setPolygons((currentFeatures) => {
			const newFeatures = { ...currentFeatures };

			for (const feature of draw.features) {
				newFeatures[ feature.id ] = feature;
			}

			return newFeatures;
		});

		setIsDrawing(false);
	}, [ ]);

	const addPolygonMouseEvents = () => {
		mapbox.on('mouseenter', 'gl-draw-polygon-fill-inactive.cold', (e) => {
			onPolygonMouseEnter(e);
		});

		mapbox.on('mouseleave', 'gl-draw-polygon-fill-inactive.cold', () => {
			onPolygonMouseLeave();
		});

		// Disables interaction by resetting the mode when a feature is selected
		mapbox.on('draw.selectionchange', () => {
			setTimeout(() => drawRef?.changeMode('simple_select'), 150);
		});
	};

	const onPolygonMouseEnter = (e) => {
		const features = mapbox.queryRenderedFeatures(e.point);
		const { geometry, properties } = features[ 0 ];
		const { coordinates } = turf.centroid(geometry as turf.AllGeoJSON).geometry;
		const { user_polygon_name: polygonName } = properties;

		if (tooltipTimeout !== undefined) {
			clearTimeout(tooltipTimeout);
			tooltipTimeout = undefined;
		}

		setPolygonTooltip({ coordinates, tooltipText: polygonName || '' });
		setShowTooltip(true);
	};

	const onPolygonMouseLeave = () => {
		tooltipTimeout = setTimeout(() => {
			setShowTooltip(false);
			setPolygonTooltip({ coordinates: [], tooltipText: '' });
		}, 100);
	};

	const prepareNewTarget = () => {
		const statesCount = gameContentPolygons.length;
		const clueCount = statesCount < defaultClueCount + 5 ? Math.max(0, statesCount - 5) : defaultClueCount;
		const randomIndices = randomUniqueIndices(clueCount + 1, statesCount);
		const [ randomStateIndex ] = randomIndices;

		if (clueMode) {
			setCluePolygons(() => []);

			randomIndices.delete(randomStateIndex);

			const randomCluePolygons = gameContentPolygons.filter((_, index) => randomIndices.has(index)).map(([ polygonName, polygonData ]) => {
				return { data: polygonData, name: polygonName };
			});

			setCluePolygons(randomCluePolygons);
		}

		for (let i = 0; i < gameContentPolygons.length; i++) {
			if (i === randomStateIndex) {
				const [ polygonName, polygonData ] = gameContentPolygons[ i ];

				setTargetPolygon(polygonData);
				setTargetState(polygonName);
				gameContentPolygons.splice(i, 1);

				break;
			}
		}
	};

	const restartGame = () => {
		setPastPolygons(() => []);
		setCluePolygons(() => []);

		gameContentPolygons = determineGameContentPolygons(content);

		flyToInitialPosition();

		resetTarget();
		setTotalFinalScore(0);
		setDidGameEnd(false);
		setShowResults(false);
		setIsDrawing(false);
		setTargetCount(1);
		setTargetState('');
		setTargetPolygon(undefined);
		prepareNewTarget();
	};

	const resetTarget = () => {
		setUserPolygon(undefined);
		setTargetPolygon(undefined);

		drawRef?.deleteAll();

		flyToInitialPosition();

		setFinalScore(-1);
		setPolygons({});
	};

	const flyToInitialPosition = () => {
		if (content === 'us-states') {
			mapbox.flyTo({
				center: [ -98, 36 ],
				zoom: 3.5
			});
		}

		if (content === 'europe') {
			mapbox.flyTo({
				center: [ 15, 55 ],
				zoom: 3.6
			});
		}

		if (content === 'south-america') {
			mapbox.flyTo({
				center: [ -69, -19 ],
				zoom: 2.9
			});
		}
	};

	const flyToTargetDestination = (targetDestination: any) => {
		const area = turf.area(targetDestination);
		const center = turf.centroid(targetDestination);
		const { coordinates } = center.geometry;
		const areaMillionth = area / 1000000000;
		let zoomLevel = 5;

		if (areaMillionth > 1500) {
			zoomLevel = 3.45;
		}
		else if (areaMillionth > 1000) {
			zoomLevel = 3.75;
		}
		else if (areaMillionth > 500) {
			zoomLevel = 4;
		}
		else if (areaMillionth > 300) {
			zoomLevel = 4.25;
		}
		else if (areaMillionth < 5) {
			zoomLevel = 8.5;
		}
		else if (areaMillionth < 10) {
			zoomLevel = 7.5;
		}
		else if (areaMillionth < 25) {
			zoomLevel = 6.5;
		}
		else if (areaMillionth < 50) {
			zoomLevel = 6.25;
		}

		mapbox.flyTo({
			center: coordinates as LngLatLike,
			zoom: zoomLevel
		});
	};

	const renderMenu = () => {
		if (showResults) {
			return (
				<div className='menu'>
					<div className='title'>Final Score</div>
					<div className='total-score'>{ totalFinalScore } / { maximumScore * Number(totalTargetCount) } </div>
				</div>
			);
		}

		return (
			<div className='menu'>
				<div className='current-state'>
					<span>{ targetState }</span>
					<span className='count'>{ targetCount } / { totalTargetCount }</span>
				</div>

				{ finalScore >= 0 && <div className='final-score'><span>Score:</span> { finalScore } / { maximumScore }</div> }
			</div>
		);
	};

	const renderPolygonTooltip = () => {
		if (showTooltip && polygonTooltip) {
			const { coordinates, tooltipText } = polygonTooltip;

			if (tooltipText === '') {
				return null;
			}

			return (
				<Popup
					anchor='bottom'
					closeButton={ false }
					closeOnClick={ false }
					closeOnMove
					focusAfterOpen={ false }
					longitude={ coordinates[ 0 ] }
					latitude={ coordinates[ 1 ] }
					offset={ [ 0, -30 ] }>
					<div className='polygon-tooltip'>
						{ tooltipText }
					</div>
				</Popup>
			);
		}

		return null;
	};

	React.useEffect(() => {
		if (!content || (content !== 'us-states' && content !== 'europe' && content !== 'south-america')) {
			navigate('game');
		}

		flyToInitialPosition();

		if ((!totalTargetCount || Number(totalTargetCount) < 1
		|| (content === 'us-states' && Number(totalTargetCount) > 50)
		|| (content === 'europe' && Number(totalTargetCount) > 38)
		|| (content === 'south-america' && Number(totalTargetCount) > 13))) {
			navigate(`game/${content}`);
		}

		gameContentPolygons = determineGameContentPolygons(content);

		// Mapbox Polygon Related Event Listeners
		addPolygonMouseEvents();

		// Set up the first target
		prepareNewTarget();
	}, [ ]);

	React.useEffect(() => {
		if (userPolygon && targetCount === Number(totalTargetCount)) { // TODO: Change this when user can add multiple polygons
			setDidGameEnd(true);
		}
	}, [ finalScore ]);

	React.useEffect(() => {
		if (polygons && Object.keys(polygons).length === 1) {
			const firstPolygon = polygons[ Object.keys(polygons)[ 0 ] ];

			setUserPolygon(firstPolygon);
		}
	}, [ polygons ]);

	React.useEffect(() => {
		if (!userPolygon) {
			return;
		}

		determineResults();
	}, [ userPolygon ]);

	React.useEffect(() => {
		if (targetCount > 1) {
			resetTarget();
			prepareNewTarget();
		}

		if (clueMode) {
			displayPastPolygons();
		}
	}, [ targetCount ]);

	React.useEffect(() => {
		if (clueMode) {
			displayCluePolygons();
		}
	}, [ cluePolygons ]);

	React.useEffect(() => {
		if (showResults) {
			drawRef?.deleteAll();
			flyToInitialPosition();
			displayPastPolygons();
		}
	}, [ showResults ]);

	return (
		<div className='polygon-game'>
			<DrawingTools
				onCreate={ onDrawUpdate }
				onDelete={ onDrawDelete }
				onUpdate={ onDrawUpdate } />

			{ renderMenu() }

			<div className='buttons'>
				{
					!isDrawing && !userPolygon && <button className='start' onClick={ onDrawStart }>Draw</button>
				}

				{
					finalScore >= 0 && !isDrawing && !didGameEnd &&
					<button className='next' onClick={ incrementTargetCount }>Next</button>
				}

				{
					didGameEnd && !showResults && <button className='show-results' onClick={ () => setShowResults(true) }>Show Results</button>
				}

				{
					showResults && <button className='restart' onClick={ () => restartGame() }>Restart Game</button>
				}
			</div>

			{ renderPolygonTooltip() }
		</div>
	);
};

export default PolygonGame;
