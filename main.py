import pandas as pd
import networkx as nx
from itertools import combinations


# Group files by the import path
imports_dict = {}
for _, row in import_sources_df.iterrows():
    filename = row["Filename"]
    import_path = row["Feature Value"]
    imports_dict.setdefault(import_path, set()).add(filename)

# Build the graph and increment edge weight for each shared import
G = nx.Graph()
all_files = import_sources_df["Filename"].unique()
G.add_nodes_from(all_files)

for import_path, files_set in imports_dict.items():
    for f1, f2 in combinations(files_set, 2):
        if G.has_edge(f1, f2):
            # Increment weight if edge already exists
            G[f1][f2]['weight'] += 1
            # Optionally, you can also store all import paths in a list:
            G[f1][f2]['imports'].append(import_path)
        else:
            # Create edge with initial weight and store the import path in a list
            G.add_edge(f1, f2, weight=1, imports=[import_path])



import networkx as nx

# Assume G is your weighted graph
threshold = 5  # Set a threshold based on your criteria (5 is used arbitraily here)

# Create a new graph with only edges above the threshold
G_threshold = nx.Graph(
    (u, v, d) for u, v, d in G.edges(data=True) if d['weight'] >= threshold
)

# Extract connected components (clusters)
clusters = list(nx.connected_components(G_threshold))
print("Clusters based on thresholding:", clusters)



[len(k) for k in clusters]

from networkx.algorithms.community import greedy_modularity_communities

# This will find communities considering the weight attribute
communities = list(greedy_modularity_communities(G, weight='weight'))
print("Communities detected via greedy modularity:", communities)

communities


import networkx as nx

# Assume G is your weighted graph with edge attribute 'imports'
# And suppose you already isolated clusters; here we use connected components as an example.
#clusters = list(nx.connected_components(G))

# Dictionary to hold shared imports for each cluster
cluster_shared_imports = {}

for i, component in enumerate(clusters):
    # Create an induced subgraph for the current component
    subgraph = G_threshold.subgraph(component)
    shared_imports = set()  # To store unique shared imports in this component

    # Iterate over all edges in the subgraph
    for u, v, data in subgraph.edges(data=True):
        # Get the 'imports' attribute (assumed to be a list)
        imports_on_edge = data.get('imports', [])
        # Update the set with imports from this edge
        shared_imports.update(imports_on_edge)

    # Store the result
    cluster_shared_imports[i] = {
        'nodes': list(component),
        'shared_imports': shared_imports
    }

# Display the clusters with their shared imports
for cluster_id, info in cluster_shared_imports.items():
    print(f"Cluster {cluster_id}")
    print(f"---------------------------")
    print(f"Files in this cluster")
    print('\n'.join(info['nodes']))
    print(f"Imports shared by the files in this cluster")
    print(','.join(info['shared_imports']))
    print(f"---------------------------")

