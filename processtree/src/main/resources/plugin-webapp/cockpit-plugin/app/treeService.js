define([ 'angular' ], function(angular) {

	var css = "/camunda/api/tasklist/plugin/process-tree-plugin/static/lib/themes/default/style.css";
	$.get(css, function(data){
		// while including the css file we lose the context of the file path, so we need to enrich the includes of the images with absolute url 
		data = data.replace(/(\(\"32px\.png\"\))/g, '("/camunda/api/tasklist/plugin/process-tree-plugin/static/lib/themes/default/32px.png")');
		data = data.replace(/(\(\"40px\.png\"\))/g, '("/camunda/api/tasklist/plugin/process-tree-plugin/static/lib/themes/default/40px.png")');
		data = data.replace(/(\(\"throbber\.gif\"\))/g, '("/camunda/api/tasklist/plugin/process-tree-plugin/static/lib/themes/default/throbber.gif")');
	    $("<style type=\"text/css\">" + data + "</style>").appendTo(document.head);
	});

	
	var treeServiceModule = angular.module('treeService', []);

	treeServiceModule.factory('treeService', ['camAPI','$q',function(camAPI,$q) {

		var treeServiceFactory = {};

		treeServiceFactory.treeDataByCurrentTask = function(task) {

			var treeDataByCurrentTaskDefer = $q.defer();
			
			var procDefId = null;					
			var currentProcessInstanceId = task.processInstanceId;							

			//find parent of process instance for current task.
			HistoryService = camAPI.resource('history');
			ProcessDefinition = camAPI.resource("process-definition");
			
			var workingObject = [ 'Simple root node HAHA', {
				'id' : 'node_2',
				'text' : 'Root node with options',
				'state' : {
					'opened' : true,
					'selected' : true
				},
				'children' : [ {
					'text' : 'Child 1'
				}, 'Child 2' ]
			} ];			
			
									
			fillTheTree().then(
					function(treeData) {
						treeDataByCurrentTaskDefer.resolve(treeData);
					},
					function(error) {
						treeDataByCurrentTaskDefer.reject(error);
					}
			);			
			
			function fillTheTree() {
				var fillTheTreeDefer = $q.defer();
				HistoryService.processInstance({processInstanceId: currentProcessInstanceId},function(err,res) {
					if (err) {
						throw err;
					} else {
						if (res[0] != null) {
							var instance = res[0];
							var treeDataToBeFilled = {};						
							
							var topInstance;
							
							findTopParent(instance).then(									
									function (succInstance) {
										topInstance = succInstance										
										var treeDataToBeFilled = {};
										treeDataToBeFilled.id = topInstance.id;
										treeDataToBeFilled.definitionId = topInstance.processDefinitionId;
										treeDataToBeFilled.text = topInstance.processDefinitionKey;
										
										var selected = topInstance.id == currentProcessInstanceId;
										var styleClass = (topInstance.endTime != null ? 'active' : 'ended');										
										treeDataToBeFilled.li_attr = {'class' : styleClass};
										treeDataToBeFilled.state = {'opened' : true, 'selected' : selected};
										
										
										if (topInstance != null) {
											enrichWithChildren(topInstance, treeDataToBeFilled).then(											
												function (succInstance) {													
													fillTheTreeDefer.resolve(treeDataToBeFilled);														
												},
												function (error) {
													console.log(error);
													fillTheTreeDefer.reject(error);
												}
											);
										}									
									},
									function (error){
										console.log(error);
										fillTheTreeDefer.reject(error);
									}
							);						
						}
					}
				});
				return fillTheTreeDefer.promise;
			}
			
			function enrichWithChildren(instance, node, parentDeferred) {
				
				var enrichWithChildrenDeferred = parentDeferred || $q.defer();
				
				var HistoryService = camAPI.resource('history');
				HistoryService.processInstance({superProcessInstanceId: instance.id}, function(err, res) {
					if (err) {
						enrichWithChildrenDeferred.reject(err);
					} else {
						if (res.length == 0) {
							//exit condition
							enrichWithChildrenDeferred.resolve(instance);
						} else {
							var children = [];
							for (i=0;i<res.length;i++) {
								var child = {};
								child.id = res[i].id;
								child.text = res[i].processDefinitionKey;
								child.definitionId = res[i].processDefinitionId;
								var selected = child.id == currentProcessInstanceId;
								child.state = {'opened' : true, 'selected' : selected};
								var styleClass = (child.endTime != null ? 'active' : 'ended');
								child.li_attr = {'class' : styleClass};
								children.push(child);
							}
							node.children = children;
							
							var childrenDeferred = [];
							
							for (i=0;i<node.children.length;i++) {								
								var childDeferred = $q.defer(); 								
								childrenDeferred[i] = enrichWithChildren(res[i],node.children[i], childDeferred);
							}
							$q.all(childrenDeferred).then(function() { enrichWithChildrenDeferred.resolve(instance)});
						}						
					}
				});
				return enrichWithChildrenDeferred.promise;
			}
			
			
			function findTopParent(instance, parentDeferred) {
				
				var findTopParentDefered = parentDeferred || $q.defer();
				
				var HistoryService = camAPI.resource('history');
				HistoryService.processInstance({subProcessInstanceId: instance.id}, function(err, res) {
					if (err) {
						findTopParentDefered.reject(err);
					} else {
						//exit condition:
						var superInstances = res;
						if (superInstances[0] == null || superInstances[0]['id'] == null) {
							instance['superProcessInstanceId']='#';									
							findTopParentDefered.resolve(instance);
						} else {
							//recursion:
							findTopParent(superInstances[0], findTopParentDefered).then(
									function(succInstance){findTopParentDefered.resolve(succInstance)},
									function(error){deferred.findTopParentDefered(error)}
							);
						}
					}
				});	
				return findTopParentDefered.promise;
			}
			
			
			return treeDataByCurrentTaskDefer.promise;			
		}
		return treeServiceFactory;
	}]);
								 
	treeServiceModule.directive('processTree', ['treeService', function(treeService) {
		
		function link(scope, element, attrs) {
			
			var currentTaskObject = attrs.currentTask ? scope.$parent.$eval(attrs.currentTask) : {};
						 
			treeService.treeDataByCurrentTask(currentTaskObject).then(
						function(succInstance) {

							scope.treeData = succInstance;							
							
							scope.treeConfig = {
									"core" : {
										"themes" : {
											"variant" : "large", 
											"icons":false
										}
									}
								//,
									//"plugins" : [ "wholerow" ]
								}
															    
							    scope.selectNodeCB = function(node, selected, event) {
							    
								ProcessDefinition.get(selected.node.original.definitionId, 
                             		   function (err, res) {
                       			   
                             	   if(err) {
                             		   throw err;
                             	   } else {
                             		   if(res != null) {
                             			   
                             			   scope.$parent.processDefinition = res;
                             			   
                             		   }
                             		   
                             	   }
                             	   
                                });
								

							};

						},
						function(error) {
							throw error;
						}
					);						
		    
		}
		
		return {
			scope: {
				currentTask: '=',
			},
			link: link,
			templateUrl: '/camunda/api/tasklist/plugin/process-tree-plugin/static/app/treeService.html'
		}
	}]);
});