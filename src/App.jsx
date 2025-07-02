import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import { Search, Users, AlertCircle, Loader2, X } from 'lucide-react';

const SocialGraphApp = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [graphData, setGraphData] = useState(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [currentRootId, setCurrentRootId] = useState(null);
  const [hoveredUser, setHoveredUser] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });
  const svgRef = useRef();
  const searchRef = useRef(null);
  const currentUserId = 6; // Hardcoded to Alice's ID for now

  // Fetch graph data for a user
  const fetchGraphData = async (id, depth = 3) => {
    setGraphLoading(true);
    setGraphError('');
    setGraphData(null); // Clear previous graph during load
    
    try {
      const response = await fetch(`http://localhost:8080/graph/${id}?depth=${depth}`);
      if (!response.ok) {
        throw new Error(response.status === 404 ? 'User not found' : 'Failed to fetch graph data');
      }
      const data = await response.json();
      setGraphData(data);
      setCurrentRootId(parseInt(id));
    } catch (err) {
      setGraphError(err.message);
      setGraphData(null);
    } finally {
      setGraphLoading(false);
    }
  };

  // Search users by prefix with debounce
  const searchUsers = useCallback(async (prefix) => {
    if (!prefix || prefix.length < 1) {
      setSearchResults([]);
      return;
    }
    
    setSearchLoading(true);
    setSearchError('');
    
    try {
      const response = await fetch(
        `http://localhost:8080/${currentUserId}/search?prefix=${prefix}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch search results');
      }
      
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      setSearchError(err.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [currentUserId]);

  // Debounce search function
  useEffect(() => {
    const handler = setTimeout(() => {
      const query = searchQuery.trim();
      if (query) {
        // If query is numeric, treat as user ID
        if (!isNaN(query)) {
          fetchGraphData(query);
          setSearchResults([]);
        } else {
          searchUsers(query);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);
    
    return () => clearTimeout(handler);
  }, [searchQuery, searchUsers]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchResults([]);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectUser = (user) => {
    setSearchQuery('');
    setSearchResults([]);
    fetchGraphData(user.id.toString());
  };

  const calculateNodeDepths = (nodes, edges, rootId) => {
    const depths = new Map();
    const visited = new Set();
    const queue = [{ id: rootId, depth: 0 }];
    
    depths.set(rootId, 0);
    visited.add(rootId);

    // Build adjacency list
    const adjacency = new Map();
    nodes.forEach(node => adjacency.set(node.id, []));
    edges.forEach(edge => {
      adjacency.get(edge.source).push(edge.target);
      adjacency.get(edge.target).push(edge.source);
    });

    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      const neighbors = adjacency.get(id) || [];
      
      neighbors.forEach(neighborId => {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          depths.set(neighborId, depth + 1);
          queue.push({ id: neighborId, depth: depth + 1 });
        }
      });
    }

    return depths;
  };

  const getNodeColor = (depth) => {
    const colors = [
      '#3B82F6', // blue-500 - root
      '#10B981', // emerald-500 - depth 1
      '#F59E0B', // amber-500 - depth 2
      '#EF4444', // red-500 - depth 3
      '#8B5CF6', // violet-500 - depth 4+
    ];
    return colors[Math.min(depth, colors.length - 1)];
  };

  // Render D3 graph
useEffect(() => {
  if (!graphData || !graphData.nodes.length) return;

  const svg = d3.select(svgRef.current);
  svg.selectAll("*").remove();

  const width = 800;
  const height = 600;

  svg.attr('width', width).attr('height', height);

  const nodeDepths = calculateNodeDepths(graphData.nodes, graphData.edges, currentRootId);

  // Create force simulation
  const simulation = d3.forceSimulation(graphData.nodes)
    .force('link', d3.forceLink(graphData.edges).id(d => d.id).distance(120))
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => 
      d.id === currentRootId ? 50 : 25  // Double collision radius for root
    ));

  // Create links
  const link = svg.append('g')
    .selectAll('line')
    .data(graphData.edges)
    .enter().append('line')
    .attr('stroke', '#94a3b8')
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.6);

  // Create node groups
  const nodeGroup = svg.append('g')
    .selectAll('g')
    .data(graphData.nodes)
    .enter().append('g')
    .attr('transform', d => `translate(${d.x || width/2}, ${d.y || height/2})`)
    .style('cursor', 'pointer')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // MAIN CHANGE: Make root node twice as large
  const baseNodeSize = 20;
  const rootNodeSize = baseNodeSize * 2;  // Double size for root

  // Add circles with border - root node is twice as large
  const circles = nodeGroup.append('circle')
    .attr('r', d => d.id === currentRootId ? rootNodeSize : baseNodeSize)
    .attr('fill', d => getNodeColor(nodeDepths.get(d.id) || 0))
    .attr('stroke', '#FFFFFF')
    .attr('stroke-width', d => d.id === currentRootId ? 4 : 2)
    .on('click', (event, d) => {
      event.stopPropagation();
      handleNodeClick(d.id);
    });

  // Add avatar clip paths
  nodeGroup.append('clipPath')
    .attr('id', d => `clip-${d.id}`)
    .append('circle')
    .attr('r', d => d.id === currentRootId ? rootNodeSize - 5 : baseNodeSize - 5);

  // Add avatar images - scaled for root node
  nodeGroup.append('image')
    .attr('x', d => d.id === currentRootId ? -(rootNodeSize - 5) : -(baseNodeSize - 5))
    .attr('y', d => d.id === currentRootId ? -(rootNodeSize - 5) : -(baseNodeSize - 5))
    .attr('width', d => d.id === currentRootId ? (rootNodeSize - 5) * 2 : (baseNodeSize - 5) * 2)
    .attr('height', d => d.id === currentRootId ? (rootNodeSize - 5) * 2 : (baseNodeSize - 5) * 2)
    .attr('clip-path', d => `url(#clip-${d.id})`)
    .attr('href', d => d.avatarUrl || `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white">
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
      </svg>
    `)}`)
    .style('pointer-events', 'none');

  // Add username labels - positioned lower for larger root node
  const labels = nodeGroup.append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', d => d.id === currentRootId ? (rootNodeSize + 15) : (baseNodeSize + 10))
    .attr('font-size', d => d.id === currentRootId ? '14px' : '12px')
    .attr('font-weight', d => d.id === currentRootId ? 'bold' : 'normal')
    .attr('fill', '#FFFFFF')
    .attr('stroke', '#000000')
    .attr('stroke-width', '0.5px')
    .text(d => d.username.length > 10 ? d.username.substring(0, 10) + '...' : d.username)
    .style('pointer-events', 'none');

  // Add hover effects - proportional scaling
  nodeGroup
    .on('mouseover', function(event, d) {
      d3.select(this).select('circle')
        .transition().duration(200)
        .attr('r', d.id === currentRootId ? rootNodeSize * 1.3 : baseNodeSize * 1.3);
      
      // Show user card
      setHoveredUser(d);
      setHoverPosition({ x: event.pageX, y: event.pageY });
    })
    .on('mousemove', function(event, d) {
      setHoverPosition({ x: event.pageX, y: event.pageY });
    })
    .on('mouseout', function(event, d) {
      d3.select(this).select('circle')
        .transition().duration(200)
        .attr('r', d.id === currentRootId ? rootNodeSize : baseNodeSize);
      
      // Hide user card
      setHoveredUser(null);
    });

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

      nodeGroup
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [graphData, currentRootId]);

  const handleNodeClick = (nodeId) => {
    if (nodeId !== currentRootId) {
      fetchGraphData(nodeId.toString());
    }
  };

  // Connection depth badge
  const ConnectionDepthBadge = ({ depth }) => {
    if (depth === 0) return null;
    
    const depthLabels = {
      1: 'Direct Connection',
      2: '2nd Connection',
      3: '3rd Connection'
    };
    
    const depthColors = {
      1: 'bg-emerald-500',
      2: 'bg-amber-500',
      3: 'bg-red-500'
    };
    
    return (
      <span className={`${depthColors[depth]} text-white text-xs px-2 py-1 rounded-full ml-2`}>
        {depthLabels[depth] || `${depth} connections away`}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Users className="w-8 h-8 text-blue-400" />
            <h1 className="text-4xl font-bold text-white">Social Graph Visualizer</h1>
          </div>
          <p className="text-slate-300 text-lg">Explore social connections and network relationships</p>
        </div>

        {/* Search Section */}
        <div className="max-w-xl mx-auto mb-8 relative" ref={searchRef}>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by name or ID..."
                className="w-full pl-10 pr-10 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                disabled={graphLoading}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            {/* Search Results Dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  {searchResults.map((user) => (
                    <div 
                      key={user.id}
                      className="p-3 hover:bg-slate-700/50 cursor-pointer transition-colors flex items-center border-b border-slate-700 last:border-b-0"
                      onClick={() => handleSelectUser(user)}
                    >
                      <img 
                        src={user.avatarUrl || `data:image/svg+xml;base64,${btoa(`
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#94a3b8">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                          </svg>
                        `)}`}
                        alt={user.username}
                        className="w-10 h-10 rounded-full object-cover bg-slate-700 mr-3"
                        onError={(e) => {
                          e.target.src = `data:image/svg+xml;base64,${btoa(`
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#94a3b8">
                              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                          `)}`;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <h3 className="text-white font-medium truncate">
                            {user.fullName || user.username}
                          </h3>
                          <ConnectionDepthBadge depth={user.connectionDepth} />
                        </div>
                        <p className="text-slate-400 text-sm truncate">ID: {user.id} • @{user.username}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Search Loading */}
            {searchLoading && (
              <div className="absolute inset-x-0 bottom-0 translate-y-full mt-1 bg-slate-800 border border-slate-700 rounded-lg p-4 flex justify-center">
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              </div>
            )}
            
            {/* Search Error */}
            {searchError && (
              <div className="absolute inset-x-0 bottom-0 translate-y-full mt-1 bg-red-900/50 border border-red-700 rounded-lg p-3 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-red-200 text-sm">{searchError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Graph Error Message */}
        {graphError && (
          <div className="max-w-xl mx-auto mb-8">
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <p className="text-red-200">{graphError}</p>
            </div>
          </div>
        )}

        {/* Graph Visualization */}
        {graphData && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-semibold text-white mb-2">
                  Network for {graphData.nodes.find(n => n.id === currentRootId)?.fullName || `User ${currentRootId}`}
                </h2>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="text-slate-300">
                    <span className="font-medium">{graphData.nodes.length}</span> users
                  </div>
                  <div className="text-slate-300">
                    <span className="font-medium">{graphData.edges.length}</span> connections
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setGraphData(null);
                  setCurrentRootId(null);
                  setSearchQuery('');
                }}
                className="text-slate-300 hover:text-white flex items-center gap-1 text-sm"
              >
                <X className="w-4 h-4" /> Clear
              </button>
            </div>

            {/* Legend */}
            <div className="mb-4 flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-blue-500"></div>
                <span className="text-slate-300 text-sm">Root User</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-emerald-500"></div>
                <span className="text-slate-300 text-sm">Direct Connections</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-amber-500"></div>
                <span className="text-slate-300 text-sm">2nd Connections</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-red-500"></div>
                <span className="text-slate-300 text-sm">3rd+ Connections</span>
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4 overflow-hidden relative">
              {graphLoading ? (
                <div className="h-96 flex items-center justify-center">
                  <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
                </div>
              ) : (
                <>
                  <svg ref={svgRef} className="w-full h-auto max-w-full min-h-[500px]"></svg>
                  
                  {/* User Hover Card */}
                  {hoveredUser && (
                    <div
                      className="fixed z-50 bg-slate-800 border border-slate-600 rounded-lg p-4 shadow-xl max-w-sm pointer-events-none"
                      style={{
                        left: hoverPosition.x + 10,
                        top: hoverPosition.y - 10,
                        transform: 'translateY(-100%)'
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <img
                            src={hoveredUser.avatarUrl || `data:image/svg+xml;base64,${btoa(`
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#94a3b8">
                                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                              </svg>
                            `)}`}
                            alt={hoveredUser.username}
                            className="w-12 h-12 rounded-full object-cover bg-slate-700"
                            onError={(e) => {
                              e.target.src = `data:image/svg+xml;base64,${btoa(`
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#94a3b8">
                                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                                </svg>
                              `)}`;
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-semibold text-sm truncate">
                            {hoveredUser.fullName || hoveredUser.username}
                          </h3>
                          <p className="text-slate-300 text-xs truncate">@{hoveredUser.username}</p>
                          <p className="text-slate-400 text-xs truncate mt-1">{hoveredUser.email}</p>
                          <div className="mt-2 text-xs">
                            <span className="text-slate-500">User ID: </span>
                            <span className="text-slate-300">{hoveredUser.id}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-4 text-center">
              <p className="text-slate-400 text-sm">
                Hover over nodes to see user details • Click on any node to explore their network • Drag nodes to rearrange
              </p>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!graphData && !graphLoading && (
          <div className="max-w-2xl mx-auto text-center">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-8">
              <Users className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-4">Get Started</h3>
              <div className="text-slate-300 space-y-2">
                <p>Search for users by name or ID to visualize their social network</p>
                <p className="text-sm">• Enter a numeric ID to directly load a user's graph</p>
                <p className="text-sm">• Search by name prefix to find connections in your network</p>
                <p className="text-sm">• Results show connection depth to your network</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SocialGraphApp;